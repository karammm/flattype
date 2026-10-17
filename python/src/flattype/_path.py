"""Paths (``user.address.zip``, ``rows[2]{id,name}``) and building the decoded value from them."""

from __future__ import annotations

import json
import re
from typing import Any, Callable, NoReturn, Union

from ._syntax import FlatDecodeError, Warn, format_key, format_number, is_key_char, scan_string

#: A key (str) or an array index (int; a float only for indexes too large to be valid).
Segment = Union[str, int, float]
#: ("value",) | ("inline", delimiter) | ("table", count, delimiter, fields)
Terminal = tuple[Any, ...]

VALUE: Terminal = ("value",)
_DIGITS = re.compile(r"[0-9]+")

#: The most nulls lenient decoding inserts for a skipped index range.
MAX_GAP = 1000


def _at(s: str, i: int) -> str:
    return s[i] if i < len(s) else ""


def _number(digits: str) -> int | float:
    # Like JavaScript's Number(digits): exact up to 15 digits, a float (maybe inf) beyond.
    return int(digits) if len(digits) <= 15 else float(digits)


def show_number(n: int | float) -> str:
    return str(n) if isinstance(n, int) else format_number(n)


def parse_path(s: str, pos: int, line: int) -> tuple[list[Segment], Terminal, int]:
    """Reads a path starting at ``pos``. Stops at the first character that can't continue a path (normally ``:``)."""
    segments: list[Segment] = []

    def fail(msg: str, at: int) -> NoReturn:
        raise FlatDecodeError(msg, line, at + 1)

    need_key = False
    while True:
        c = _at(s, pos)
        if c == '"' or (c != "" and is_key_char(c)):
            if segments and not need_key:
                fail("Expected '.' or ':' before key", pos)
            pos = _read_key(s, pos, segments, fail)
            need_key = False
            if _at(s, pos) == ".":
                pos += 1
                need_key = True
            continue
        if need_key:
            fail("Expected a key after '.'", pos)
        if c != "[":
            break
        close = s.find("]", pos)
        if close < 0:
            fail("Unclosed '['", pos)
        inner = s[pos + 1 : close]
        if inner in ("", "|", "\t"):
            return segments, ("inline", inner or ","), close + 1
        digits, mark = inner, ""
        if inner[-1] in "|\t":
            digits, mark = inner[:-1], inner[-1]
        if not _DIGITS.fullmatch(digits):
            fail(f"Invalid index '[{inner}]'", pos)
        n = _number(digits)
        pos = close + 1
        if _at(s, pos) == "{":
            delimiter = mark or ","
            fields, end = _read_fields(s, pos + 1, delimiter, fail)
            return segments, ("table", n, delimiter, fields), end
        if mark != "":
            fail("A delimiter mark is only allowed on inline arrays and tables", pos - 1)
        segments.append(n)
        if _at(s, pos) == ".":
            pos += 1
            need_key = True
    return segments, VALUE, pos


def _read_key(s: str, pos: int, out: list[Segment], fail: Callable[[str, int], NoReturn]) -> int:
    if s[pos] == '"':
        close = scan_string(s, pos)
        if close < 0:
            fail("Unterminated quoted key", pos)
        try:
            out.append(json.loads(s[pos : close + 1]))
        except ValueError:
            fail("Invalid quoted key", pos)
        return close + 1
    end = pos
    n = len(s)
    while end < n and is_key_char(s[end]):
        end += 1
    out.append(s[pos:end])
    return end


def _read_fields(s: str, pos: int, delimiter: str, fail: Callable[[str, int], NoReturn]) -> tuple[list[list[Segment]], int]:
    """Reads ``id,user.name}`` (after the ``{``) into one key path per field."""
    fields: list[list[Segment]] = []
    while True:
        while _at(s, pos) == " ":
            pos += 1
        field: list[Segment] = []
        while True:
            c = _at(s, pos)
            if c != '"' and not (c != "" and is_key_char(c)):
                fail("Expected a field name", pos)
            pos = _read_key(s, pos, field, fail)
            if _at(s, pos) != ".":
                break
            pos += 1
        fields.append(field)
        while _at(s, pos) == " ":
            pos += 1
        c = _at(s, pos)
        if c == "}":
            return fields, pos + 1
        if c != delimiter:
            fail(f"Expected '{chr(92) + 't' if delimiter == chr(9) else delimiter}' or '}}' in table header", pos)
        pos += 1


class Ref:
    """Placeholder for a ``path = target`` line until the whole document has been read."""

    __slots__ = ("segments", "target", "line")

    def __init__(self, segments: list[Segment], target: list[Segment], line: int) -> None:
        self.segments = segments
        self.target = target
        self.line = line


def assign(
    holder: dict[str, Any], segments: list[Segment], value: Any, strict: bool, line: int, warn: Warn | None = None
) -> None:
    """Writes ``value`` at ``segments`` under ``holder["root"]``, creating dicts and lists on the way. In lenient
    mode, what it repairs (duplicates, skipped indexes) goes to ``warn``."""
    parent: Any = holder
    key: Segment = "root"

    def fail(msg: str) -> NoReturn:
        raise FlatDecodeError(msg, line, 1)

    def slot(create: Callable[[], Any], leaf: bool) -> Any:
        if not isinstance(key, str):
            arr: list[Any] = parent
            if key < len(arr):
                if leaf:
                    if strict:
                        fail(f"Duplicate index [{show_number(key)}]")
                    if warn:
                        warn(f"Duplicate index [{show_number(key)}]", line, 1, "the last value is kept")
                    arr[int(key)] = create()
                return arr[int(key)]
            if key > len(arr):
                if strict:
                    fail(f"Index [{show_number(key)}] skips [{len(arr)}]")
                # Lenient mode fills small gaps with None, but `a[999999999]: 1` must not allocate a billion entries.
                if key - len(arr) > MAX_GAP:
                    fail(f"Index [{show_number(key)}] is too far past [{len(arr)}]")
                if warn:
                    warn(f"Index [{show_number(key)}] skips [{len(arr)}]", line, 1, "the gap is filled with null")
                arr.extend([None] * (int(key) - len(arr)))
            v = create()
            arr.append(v)
            return v
        obj: dict[str, Any] = parent
        if key in obj:
            if not leaf:
                return obj[key]
            if strict:
                fail(f"Duplicate key '{key}'")
            if warn:
                warn(f"Duplicate key '{key}'", line, 1, "the last value is kept")
        v = create()
        obj[key] = v
        return v

    for seg in segments:
        want_list = not isinstance(seg, str)
        cur = slot(list if want_list else dict, False)
        if not isinstance(cur, list if want_list else dict):
            fail(f"Path conflict at {'[' + show_number(key) + ']' if not isinstance(key, str) else repr_key(key)}")
        parent = cur
        key = seg
    slot(lambda: value, True)


def check(holder: dict[str, Any], segments: list[Segment], strict: bool, line: int) -> None:
    """Raises exactly the error :func:`assign` would, without changing anything, so a line that fails leaves no
    trace (used when lenient decoding skips lines it can't read)."""

    def fail(msg: str) -> NoReturn:
        raise FlatDecodeError(msg, line, 1)

    # What sits at `key` in `parent`; `fresh` means `parent` doesn't exist yet (it would be created empty).
    parent: Any = holder
    key: Segment = "root"
    fresh = False

    def lookup(leaf: bool) -> Any:
        if not isinstance(key, str):
            length = 0 if fresh else len(parent)
            if key < length:
                if leaf and strict:
                    fail(f"Duplicate index [{show_number(key)}]")
                return _MISSING if leaf else parent[int(key)]
            if key > length:
                if strict:
                    fail(f"Index [{show_number(key)}] skips [{length}]")
                if key - length > MAX_GAP:
                    fail(f"Index [{show_number(key)}] is too far past [{length}]")
            return _MISSING
        if not fresh and key in parent:
            if not leaf:
                return parent[key]
            if strict:
                fail(f"Duplicate key '{key}'")
        return _MISSING

    for seg in segments:
        want_list = not isinstance(seg, str)
        cur = lookup(False)
        if cur is _MISSING:
            fresh = True
        else:
            if not isinstance(cur, list if want_list else dict):
                fail(f"Path conflict at {'[' + show_number(key) + ']' if not isinstance(key, str) else repr_key(key)}")
            parent = cur
            fresh = False
        key = seg
    lookup(True)


def repr_key(key: str) -> str:
    return f"'{key}'"


_MISSING = object()


def _js_get(container: Any, seg: Segment) -> Any:
    """``container[seg]`` if it is an own property in JavaScript terms (so ``[0]`` on a dict reads key "0")."""
    if isinstance(container, dict):
        k = seg if isinstance(seg, str) else show_number(seg)
        return container.get(k, _MISSING)
    if isinstance(container, list):
        if isinstance(seg, str):
            return len(container) if seg == "length" else _MISSING
        return container[int(seg)] if 0 <= seg < len(container) else _MISSING
    return _MISSING


def _show(segments: list[Segment]) -> str:
    if not segments:
        return "~"
    out = ""
    for i, s in enumerate(segments):
        if not isinstance(s, str):
            out += f"[{show_number(s)}]"
        else:
            out += format_key(s) if i == 0 else "." + format_key(s)
    return out


def resolve_refs(holder: dict[str, Any], refs: list[Ref], strict: bool, warn: Warn | None = None) -> None:
    """Replaces each placeholder with the dict or list its target points to, in document order.

    A target may pass through a reference resolved before it, but not through one still waiting.
    """
    for ref in refs:
        # Lenient decoding may have overwritten the placeholder (or a parent) with a later line; that line wins.
        parent: Any = holder.get("root", _MISSING)
        last = len(ref.segments) - 1
        for seg in ref.segments[:last]:
            if not isinstance(parent, (dict, list)):
                break
            parent = _js_get(parent, seg)
        if not isinstance(parent, (dict, list)) or _js_get(parent, ref.segments[last]) is not ref:
            continue

        cur: Any = holder.get("root", _MISSING)
        for seg in ref.target:
            cur = _js_get(cur, seg) if isinstance(cur, (dict, list)) else _MISSING
        value = cur
        if not isinstance(cur, (dict, list)):
            if isinstance(cur, Ref):
                why = "is a reference that comes later"
            elif cur is _MISSING:
                why = "doesn't exist"
            else:
                why = "isn't an object or array"
            msg = f"Reference target '{_show(ref.target)}' {why}"
            if strict:
                raise FlatDecodeError(msg, ref.line, 1)
            if warn:
                warn(msg, ref.line, 1, "read as null")
            value = None
        k = ref.segments[last]
        if isinstance(parent, list):
            parent[int(k)] = value
        else:
            parent[k if isinstance(k, str) else show_number(k)] = value
