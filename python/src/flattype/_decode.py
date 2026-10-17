"""Flat Notation -> Python values, whole or streamed."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from ._path import Ref, Segment, assign, check, parse_path, resolve_refs, show_number
from ._syntax import INVALID, FlatDecodeError, FlatWarning, Warn, format_key, js_trim, parse_scalar, scan_string


@dataclass(frozen=True)
class TableRow:
    """One table row, passed to ``on_row`` as soon as its line has been read."""

    #: Path of the table, e.g. ``"users"`` or ``"data.items"``; ``""`` for a root table.
    path: str
    #: Row number within the table, from 0.
    index: int
    value: Any


class _Table:
    __slots__ = ("at", "segments", "count", "delimiter", "fields", "path", "rows", "read", "keys")

    def __init__(self, at: int, segments: list[Segment], terminal: tuple[Any, ...]) -> None:
        self.at = at
        self.segments = segments
        _, self.count, self.delimiter, self.fields = terminal
        self.path = _format_path(segments)
        self.rows: list[Any] = []
        self.read = 0
        # Fields that are plain keys or dot paths that can't conflict (the usual case) are built directly, without
        # the general assign() and its duplicate / conflict checks.
        paths = [tuple(f) for f in self.fields]
        unique = set(paths)
        simple = (
            len(unique) == len(paths)
            and all(isinstance(k, str) for p in paths for k in p)
            and not any(p[:i] in unique for p in paths for i in range(1, len(p)))
        )
        self.keys: list[tuple[Any, ...]] | None = paths if simple else None


class Decoder:
    """Incremental decoder: :meth:`write` chunks as they arrive (split anywhere, even mid-line), then :meth:`end`.

    ``on_row`` is called for every table row as soon as its line is complete. With ``keep_rows=False``, rows are
    only passed to ``on_row`` and their tables stay empty, so memory stays flat for huge lists.
    """

    def __init__(
        self,
        *,
        strict: bool = True,
        refs: bool = False,
        on_row: Callable[[TableRow], None] | None = None,
        keep_rows: bool = True,
        skip_invalid_lines: bool = False,
        on_warning: Callable[[FlatWarning], None] | None = None,
    ) -> None:
        self._strict = strict
        # Lenient only: a line that can't be read is dropped, as if it weren't there.
        self._skip = not strict and skip_invalid_lines
        self._refs = refs
        self._on_row = on_row
        self._keep = keep_rows
        self._holder: dict[str, Any] = {}
        self._line_no = 0
        # The unfinished last line, as a list of pieces: appending to one growing str would be quadratic.
        self._rest: list[str] = []
        self._table: _Table | None = None
        self._pending: list[Ref] = []
        # Lenient repairs, reported to on_warning. When skipping lines, a line's warnings wait until it has been
        # read, so a line that is dropped reports only that.
        self._on_warning = None if strict else on_warning
        self._held: list[FlatWarning] | None = None
        self._warn: Warn | None = self._emit if self._on_warning else None

    def write(self, chunk: str) -> None:
        """Feeds the next chunk of text."""
        nl = chunk.find("\n")
        if nl < 0:
            if chunk:
                self._rest.append(chunk)
            return
        self._rest.append(chunk[:nl])
        self._line("".join(self._rest))
        start = nl + 1
        while True:
            nl = chunk.find("\n", start)
            if nl < 0:
                break
            self._line(chunk[start:nl])
            start = nl + 1
        self._rest = [chunk[start:]] if start < len(chunk) else []

    def _emit(self, reason: str, line: int, column: int, repair: str) -> None:
        w = FlatWarning(f"{reason}: {repair}", line, column)
        if self._held is not None:
            self._held.append(w)
        else:
            assert self._on_warning is not None
            self._on_warning(w)

    def _problem(self, reason: str, line: int, column: int, repair: str) -> None:
        """Strict: an error. Lenient: a warning, and the caller repairs it."""
        if self._strict:
            raise FlatDecodeError(reason, line, column)
        if self._warn:
            self._warn(reason, line, column, repair)

    def end(self) -> Any:
        """Finishes decoding and returns the value. An empty document is ``{}``."""
        self._line("".join(self._rest))
        self._rest = []
        table = self._table
        if table is not None:
            repair = "the table has the rows that are there"
            self._problem(f"Expected {show_number(table.count)} rows, got {table.read}", table.at, 1, repair)
            self._close_table()
        if self._pending:
            resolve_refs(self._holder, self._pending, self._strict, self._warn)
        return self._holder.get("root", {})

    def _put(self, segments: list[Segment], value: Any, at: int) -> None:
        """``assign`` into the result. When skipping lines, checked first, so a line that fails changes nothing."""
        if self._skip:
            check(self._holder, segments, self._strict, at)
        assign(self._holder, segments, value, self._strict, at, self._warn)

    def _close_table(self) -> None:
        # Cleared first: a table whose path can't be written is dropped, not left half-open.
        t = self._table
        assert t is not None
        self._table = None
        if not self._skip:
            self._put(t.segments, t.rows, t.at)
            return
        try:
            self._put(t.segments, t.rows, t.at)
        except FlatDecodeError as e:
            if self._warn:
                self._warn(e.reason, e.line, e.column, "the table is dropped")

    def _line(self, raw: str) -> None:
        self._line_no += 1
        if not self._skip:
            self._read_line(raw)
            return
        if self._on_warning:
            self._held = []
        try:
            self._read_line(raw)
        except FlatDecodeError as e:
            if self._held is not None:
                self._held = [FlatWarning(f"{e.reason}: the line is skipped", e.line, e.column)]
        held, self._held = self._held, None
        if held:
            assert self._on_warning is not None
            for w in held:
                self._on_warning(w)

    def _read_line(self, raw: str) -> None:
        line_no = self._line_no
        strict = self._strict
        text = raw[:-1] if raw.endswith("\r") else raw
        t = self._table
        if t is not None:
            width = len(t.fields)
            row = _cells(text, t.delimiter, self._problem, line_no, 1)
            if len(row) != width:
                repair = "the missing values are null" if len(row) < width else "the extra values are dropped"
                self._problem(f"Expected {width} values, got {len(row)}", line_no, 1, repair)
            if len(row) < width:
                row += [None] * (width - len(row))
            if t.keys is not None:
                value: Any = {}
                for path, cell in zip(t.keys, row):
                    d = value
                    for k in path[:-1]:
                        d = d.setdefault(k, {})
                    d[path[-1]] = cell
            else:
                obj: dict[str, Any] = {"root": {}}
                for f in range(width):
                    assign(obj, t.fields[f], row[f], strict, line_no, self._warn)
                value = obj["root"]
            if self._keep:
                t.rows.append(value)
            if self._on_row is not None:
                self._on_row(TableRow(t.path, t.read, value))
            t.read += 1
            if t.read == t.count:
                self._close_table()
            return
        pos = 0
        n = len(text)
        while pos < n and text[pos] in " \t":
            pos += 1
        if pos == n or text[pos] == "#":
            return  # blank or # comment

        segments, terminal, end = parse_path(text, pos, line_no)
        eq = end
        while eq < n and text[eq] == " ":
            eq += 1
        if terminal[0] == "value" and eq < n and text[eq] == "=":
            self._reference(segments, text, eq)
            return
        colon = end < n and text[end] == ":"
        if not colon:
            # A table header that only lacks its colon is still clearly a header: lenient mode reads it as one.
            if strict or terminal[0] != "table" or js_trim(text[end:]) != "":
                raise FlatDecodeError("Expected ':' after path", line_no, end + 1)
            if self._warn:
                self._warn("Expected ':' after the table header", line_no, end + 1, "read as a table anyway")
        value = text[end + 1 :] if colon else ""
        kind = terminal[0]
        if kind == "value":
            self._put(segments, _scalar(js_trim(value), self._problem, line_no, end + 2), line_no)
        elif kind == "inline":
            self._put(segments, _cells(value, terminal[1], self._problem, line_no, end + 2), line_no)
        else:
            if js_trim(value) != "":
                repair = "the text after the header is ignored"
                self._problem("Table rows go on the following lines", line_no, end + 2, repair)
            self._table = _Table(line_no, segments, terminal)
            if terminal[1] == 0:
                self._close_table()

    def _reference(self, segments: list[Segment], text: str, eq: int) -> None:
        """``path = target`` (``~`` is the root)."""
        line_no = self._line_no
        if not self._refs:
            self._problem("References need { refs: true }", line_no, eq + 1, "the line is skipped")
            return
        if not segments:
            raise FlatDecodeError("The root can't be a reference", line_no, eq + 1)
        pos = eq + 1
        n = len(text)
        while pos < n and text[pos] == " ":
            pos += 1
        if pos < n and text[pos] == "~":
            target: list[Segment] = []
            end = pos + 1
        else:
            target, terminal, end = parse_path(text, pos, line_no)
            if terminal[0] != "value" or not target:
                raise FlatDecodeError("Expected a path or '~' after '='", line_no, pos + 1)
        while end < n and text[end] == " ":
            end += 1
        if end != n:
            raise FlatDecodeError("Unexpected text after reference", line_no, end + 1)
        ref = Ref(segments, target, line_no)
        self._put(segments, ref, line_no)
        self._pending.append(ref)


def decode(
    text: str,
    *,
    strict: bool = True,
    refs: bool = False,
    skip_invalid_lines: bool = False,
    on_warning: Callable[[FlatWarning], None] | None = None,
) -> Any:
    """Decodes Flat Notation back into the value it came from. An empty document is ``{}``.

    ``strict=False`` recovers what it can from malformed input (for example LLM output) instead of raising.
    ``refs=True`` accepts ``path = other.path`` references and rebuilds the shared objects and cycles they describe.
    It is off by default: a few such lines can describe a graph that is endless or enormous when walked.
    ``skip_invalid_lines=True`` (with ``strict=False``) drops lines that can't be read, such as prose around data.
    ``on_warning`` (with ``strict=False``) is called for every problem that was repaired, with its line and column.
    """
    d = Decoder(strict=strict, refs=refs, skip_invalid_lines=skip_invalid_lines, on_warning=on_warning)
    d.write(text)
    return d.end()


def _format_path(segments: list[Segment]) -> str:
    out = ""
    for s in segments:
        if not isinstance(s, str):
            out += f"[{show_number(s)}]"
        else:
            out += format_key(s) if out == "" else "." + format_key(s)
    return out


def _scalar(tok: str, problem: Warn, line: int, column: int) -> Any:
    if tok == "":
        problem("Missing value", line, column, "read as null")
        return None
    v = parse_scalar(tok)
    if v is INVALID:
        problem("Invalid quoted string", line, column, "kept as text")
        return tok
    return v


def _cells(s: str, delimiter: str, problem: Warn, line: int, column: int) -> list[Any]:
    """Splits ``a, "b, c", 3`` on the delimiter, honouring quotes."""
    if '"' not in s:
        # No quotes: a plain split gives the same cells. (Column numbers are only needed for errors.)
        parts = [js_trim(x) for x in s.split(delimiter)]
        # An empty cell is a problem that needs its column: the full scan below has it.
        if "" not in parts:
            return [_scalar(p, problem, line, column) for p in parts]
    out: list[Any] = []
    n = len(s)
    spaces = " " if delimiter == "\t" else " \t"
    i = 0
    while True:
        while i < n and s[i] in spaces:
            i += 1
        if i < n and s[i] == '"':
            close = scan_string(s, i)
            if close < 0:
                problem("Unterminated string", line, column + i, "kept as text")
                out.append(s[i + 1 :])
                return out
            out.append(_scalar(s[i : close + 1], problem, line, column + i))
            i = close + 1
            while i < n and s[i] in spaces:
                i += 1
            if i < n and s[i] != delimiter:
                problem("Expected delimiter after quoted string", line, column + i, "the text after it is dropped")
            nxt = s.find(delimiter, i)
            i = n if nxt < 0 else nxt
        else:
            nxt = s.find(delimiter, i)
            j = n if nxt < 0 else nxt
            out.append(_scalar(js_trim(s[i:j]), problem, line, column + i))
            i = j
        if i >= n:
            return out
        i += 1
