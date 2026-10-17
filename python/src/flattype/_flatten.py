"""Path -> leaf dicts for in-memory use: ``{"user.name": "John", "tags[0]": "a"}``."""

from __future__ import annotations

import math
from typing import Any

from ._path import APPEND, assign, parse_path
from ._syntax import FlatDecodeError, join_key


def flatten(value: Any) -> dict[str, Any]:
    """Flattens a value into a path -> leaf dict, e.g. ``{"user": {"name": "John"}}`` -> ``{"user.name": "John"}``.

    Empty dicts and lists are kept as ``{}`` / ``[]`` leaves so :func:`unflatten` can restore them. A scalar root is
    stored under the empty path ``""``.
    """
    out: dict[str, Any] = {}
    stack: set[int] = set()

    def visit(path: str, v: Any) -> None:
        if not isinstance(v, (dict, list, tuple)):
            if not isinstance(v, (str, int, float, type(None))):
                raise TypeError(f"Object of type {type(v).__name__} is not Flat Notation serializable")
            out[path] = None if isinstance(v, float) and not math.isfinite(v) else v
            return
        if id(v) in stack:
            raise ValueError("Circular reference detected")
        stack.add(id(v))
        if isinstance(v, dict):
            if not v and path != "":
                out[path] = {}
            for k, x in v.items():
                visit(join_key(path, str(k)), x)
        else:
            if not v:
                out[path] = []
            for i, x in enumerate(v):
                visit(f"{path}[{i}]", x)
        stack.discard(id(v))

    visit("", value)
    return out


def unflatten(record: dict[str, Any]) -> Any:
    """Rebuilds the value :func:`flatten` produced. Raises :class:`FlatDecodeError` on a malformed or conflicting path."""
    holder: dict[str, Any] = {}
    for n, path in enumerate(record, 1):
        segments, terminal, end = parse_path(path, 0, n)
        if terminal[0] != "value" or end != len(path) or any(seg is APPEND for seg in segments):
            raise FlatDecodeError(f"Invalid path '{path}'", n, end + 1)
        leaf = record[path]
        assign(holder, segments, [] if isinstance(leaf, list) else {} if isinstance(leaf, dict) else leaf, True, n)
    return holder.get("root", {})
