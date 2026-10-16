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
    """
    if delimiter not in (",", "|", "\t"):
        raise ValueError('delimiter must be ",", "|" or "\\t"')
    pad = " " * indent
    sep = ", " if delimiter == "," else " | " if delimiter == "|" else "\t"
    mark = "" if delimiter == "," else delimiter
    out: list[str] = []
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
            visit(path + "[" + str(n) + "]", x)

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
        """Writes same-shaped dicts as ``path[n]{a,b.c}:`` plus one row each."""
        header: list[str] | None = None
        rows: list[str] = []
        claimed: dict[int, tuple[str, Any]] = {}
        for n, item in enumerate(items):
            at = path + "[" + str(n) + "]"
            if not isinstance(item, dict) or taken(item, at, claimed):
                return False
            keys: list[str] = []
            vals: list[Any] = []
            stack.add(id(item))
            ok = flatten_row(item, "", at, keys, vals, claimed)
            stack.discard(id(item))
            if not ok:
                return False
            if header is None:
                header = keys
            elif keys != header:
                return False
            rows.append(pad + sep.join(map(cell, vals)))
        if seen is not None:
            seen.update(claimed)
        assert header is not None
        out.append(path + "[" + str(len(items)) + mark + "]{" + delimiter.join(header) + "}:")
        out.extend(rows)
        return True

    visit("", prep(value))
    return "\n".join(out)
