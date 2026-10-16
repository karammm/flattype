from __future__ import annotations

from typing import Any


def same(a: Any, b: Any) -> bool:
    """Deep equality that, unlike ==, doesn't treat True as 1 (but does treat 30 and 30.0 as equal)."""
    if isinstance(a, bool) or isinstance(b, bool):
        return type(a) is type(b) and a == b
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        # A float of 1e16 or more with no fraction is written with JavaScript's digits and read back as an int:
        # the same number once converted back to float, but not exactly equal to it.
        return a == b or (isinstance(a, int) != isinstance(b, int) and float(a) == float(b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(same(a[k], b[k]) for k in a)
    if isinstance(a, (list, tuple)) and isinstance(b, (list, tuple)):
        return len(a) == len(b) and all(same(x, y) for x, y in zip(a, b))
    return type(a) is type(b) and a == b
