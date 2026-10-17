"""Python values -> Flat Notation."""

from __future__ import annotations

from typing import Any, Callable

from ._syntax import format_number, format_primitive, join_key

_SCALARS = (str, int, float, bool, type(None))


def _key(k: Any) -> str:
    """Dict keys as ``json.dumps`` converts them."""
    if isinstance(k, str):
        return k
    if k is True:
        return "true"
    if k is False:
        return "false"
    if k is None:
        return "null"
    if isinstance(k, int):
        return str(int(k))
    if isinstance(k, float):
        return format_number(k)
    raise TypeError(f"keys must be str, int, float, bool or None, not {type(k).__name__}")


def encode(
    value: Any,
    *,
    delimiter: str = ",",
    indent: int = 2,
    tabular: bool = True,
    refs: bool = False,
    default: Callable[[Any], Any] | None = None,
    target: str = "1.1",
) -> str:
    """Encodes a JSON-compatible value (dicts, lists, tuples, str, int, float, bool, None) as Flat Notation::

        name: John
        address.city: New York
        tags[]: admin, editor
        users[2]{id,name}:
          1, Alice
          2, Bob

    ``decode(encode(x)) == x`` for every such value. Floats are written like JavaScript writes them, so a float
    with no fractional part (``30.0``) comes back as an int (``30``).

    :param delimiter: separator for inline arrays and table rows: ``","``, ``"|"`` or ``"\\t"``.
    :param indent: spaces before each table row.
    :param tabular: write lists of same-shaped dicts as tables (header once, then one row each).
    :param refs: write an object that appears more than once (shared, or a cycle) only once, and
        ``path = first.path`` after that. Without it, shared objects are repeated and cycles raise ``ValueError``.
    :param default: called for any other object, like ``json.dumps(default=...)``; returns something encodable.
    :param target: the Flat Notation version to write. ``"1.1"`` (the default) writes lists whose dicts have different
        keys compactly: tables with optional fields (``phone?``) and ``[+]`` items. ``"1.0"`` writes text that every
        decoder before 1.14 can read. ``FlatMiddleware`` picks it from the client's ``Accept`` header.
    """
    if delimiter not in (",", "|", "\t"):
        raise ValueError('delimiter must be ",", "|" or "\\t"')
    if target not in ("1.0", "1.1"):
        raise ValueError('target must be "1.0" or "1.1"')
    v11 = target != "1.0"
    pad = " " * indent
    sep = ", " if delimiter == "," else " | " if delimiter == "|" else "\t"
    mark = "" if delimiter == "," else delimiter
    # Table rows are added with a leading "\n" (no other line can contain one) so ``[+]`` items can tell them apart
    # from path lines. It is removed when the lines are joined.
    out: list[str] = []
    in_item = 0
    ref_lines = 0
    # ids of the containers on the current path (cycle check)...
    stack: set[int] = set()
    # ...or with refs, every container and the path it was written at. The value is kept so its id stays unique.
    seen: dict[int, tuple[str, Any]] | None = {} if refs else None

    def prep(v: Any) -> Any:
        if isinstance(v, (_SCALARS, dict, list, tuple)):
            return v
        if default is None:
            raise TypeError(f"Object of type {type(v).__name__} is not Flat Notation serializable")
        return prep(default(v))

    def cell(v: Any) -> str:
        return format_primitive(v, delimiter)

    def visit(path: str, v: Any) -> None:
        if not isinstance(v, (dict, list, tuple)):
            out.append(path + ": " + format_primitive(v))
            return
        i = id(v)
        if isinstance(v, tuple):
            pass  # Immutable, and Python shares equal tuple constants: never a reference, never a cycle on its own.
        elif seen is not None:
            first = seen.get(i)
            if first is not None:
                out.append(path + " = " + (first[0] or "~"))
                nonlocal ref_lines
                ref_lines += 1
                return
            seen[i] = (path, v)
        else:
            if i in stack:
                raise ValueError("Circular reference detected (use refs=True)")
            stack.add(i)
        if isinstance(v, dict):
            visit_dict(path, v)
        else:
            visit_list(path, v)
        stack.discard(i)

    def visit_dict(path: str, obj: dict[Any, Any]) -> None:
        if not obj:
            # An empty root dict is an empty document.
            if path != "":
                out.append(path + ": {}")
            return
        for k, child in obj.items():
            visit(join_key(path, _key(k)), prep(child))

    def visit_list(path: str, arr: Any) -> None:
        if not arr:
            out.append(path + ": []")
            return
        items = [prep(x) for x in arr]
        if not any(isinstance(x, (dict, list, tuple)) for x in items):
            out.append(path + "[" + mark + "]: " + sep.join(map(cell, items)))
            return
        if tabular and table(path, items):
            return
        for n, x in enumerate(items):
            item(path, n, x)

    def item(path: str, n: int, x: Any) -> None:
        """One element of a list written line by line. In 1.1 its first line says ``path[+]`` and the others go on
        with ``.``. Inside an item, and for an item whose lines go on with an index (a list of lists) or hold a
        reference, the index is written."""
        nonlocal in_item
        at = path + "[" + str(n) + "]"
        if not v11 or in_item > 0:
            visit(at, x)
            return
        start = len(out)
        refs_before = ref_lines
        in_item += 1
        visit(at, x)
        in_item -= 1
        if ref_lines > refs_before and len(out) > start + 1:
            return
        cut = len(at)
        for k in range(start + 1, len(out)):
            if out[k][:1] != "\n" and out[k][cut : cut + 1] == "[":
                return
        out[start] = path + "[+]" + out[start][cut:]
        for k in range(start + 1, len(out)):
            if out[k][:1] != "\n":
                out[k] = out[k][cut:]

    def taken(v: Any, path: str, claimed: dict[int, tuple[str, Any]]) -> bool:
        """True if ``v`` can't go in a table row: it is on the current path (a cycle), or with refs, it was already
        written or appears twice in this table. Otherwise, with refs, claims it for ``path``."""
        i = id(v)
        if i in stack:
            return True
        if seen is None:
            return False
        if i in claimed or i in seen:
            return True
        claimed[i] = (path, v)
        return False

    def flatten_row(
        obj: dict[Any, Any], prefix: str, at: str, keys: list[str], vals: list[Any], claimed: dict[int, tuple[str, Any]]
    ) -> bool:
        """Collects the leaf paths and values of one row. False if the row can't be a table row."""
        if not obj:
            return False
        for k, child in obj.items():
            v = prep(child)
            p = join_key(prefix, _key(k))
            if isinstance(v, (dict, list, tuple)):
                if not isinstance(v, dict) or taken(v, at + "." + p, claimed):
                    return False
                stack.add(id(v))
                ok = flatten_row(v, p, at, keys, vals, claimed)
                stack.discard(id(v))
                if not ok:
                    return False
            else:
                keys.append(p)
                vals.append(v)
        return True

    def table(path: str, items: list[Any]) -> bool:
        """Writes dicts as ``path[n]{a,b.c}:`` plus one row each. In 1.1 the rows may have different keys: the
        header is all of them (``phone?`` for those some rows lack), and a row leaves the cell of a missing key empty."""
        key_rows: list[list[str]] = []
        val_rows: list[list[Any]] = []
        same = True
        claimed: dict[int, tuple[str, Any]] = {}
        for n, it in enumerate(items):
            at = path + "[" + str(n) + "]"
            if not isinstance(it, dict) or taken(it, at, claimed):
                return False
            keys: list[str] = []
            vals: list[Any] = []
            stack.add(id(it))
            ok = flatten_row(it, "", at, keys, vals, claimed)
            stack.discard(id(it))
            if not ok:
                return False
            if same and key_rows and keys != key_rows[0]:
                if not v11:
                    return False
                same = False
            key_rows.append(keys)
            val_rows.append(vals)
        lines: list[str] = []
        if same:
            header = delimiter.join(key_rows[0])
            for vals in val_rows:
                lines.append("\n" + pad + sep.join(map(cell, vals)))
        else:
            merged = _merge_fields(key_rows)
            if merged is None:
                return False
            fields, optional = merged
            header = delimiter.join(f + "?" if f in optional else f for f in fields)
            index = {f: j for j, f in enumerate(fields)}
            for keys, vals in zip(key_rows, val_rows):
                cells = [""] * len(fields)
                for k, v in zip(keys, vals):
                    cells[index[k]] = cell(v)
                # An empty last cell would leave a space at the end of the line.
                lines.append("\n" + (pad + sep.join(cells)).rstrip(" "))
        if seen is not None:
            seen.update(claimed)
        out.append(path + "[" + str(len(items)) + mark + "]{" + header + "}:")
        out.extend(lines)
        return True

    visit("", prep(value))
    return "\n".join(line[1:] if line[:1] == "\n" else line for line in out)


def _merge_fields(rows: list[list[str]]) -> tuple[list[str], set[str]] | None:
    """The header of a table whose rows have different keys, like @flattype/core's: every key, in an order that
    keeps each row's keys in their order. A key not seen before goes just before the next key of its row that the
    header has, or at the end. None when there is no such order, when no key is in every row, when a key is a
    prefix of another (``a`` and ``a.b``), or when the header would be more than twice as wide as the widest row."""
    widest = max(len(keys) for keys in rows)
    fields: list[str] = []
    known: set[str] = set()
    for keys in rows:
        at = 0
        for j, k in enumerate(keys):
            if k in known:
                i = fields.index(k)
                if i < at:
                    return None
                at = i + 1
                continue
            if len(fields) == 2 * widest:
                return None
            before = len(fields)
            for later in keys[j + 1 :]:
                if later in known:
                    before = fields.index(later)
                    break
            if before < at:
                return None
            known.add(k)
            fields.insert(before, k)
            at = before + 1
    count: dict[str, int] = {}
    for keys in rows:
        for k in keys:
            count[k] = count.get(k, 0) + 1
    optional = {f for f in fields if count[f] != len(rows)}
    if len(optional) == len(fields):
        return None
    for a in fields:
        for b in fields:
            if b.startswith(a + "."):
                return None
    return fields, optional
