"""Content negotiation, with the same rules as ``@flattype/http``."""

from __future__ import annotations

MEDIA_TYPE = "text/x-flat"
#: The ``Accept`` header a client sends: Flat Notation first, JSON as the fallback.
ACCEPT = f"{MEDIA_TYPE}, application/json;q=0.9, */*;q=0.1"


def _quality(accept: str, media_type: str) -> float:
    best = -1.0
    for part in accept.split(","):
        media, *params = part.strip().split(";")
        if media.strip().lower() != media_type:
            continue
        q = 1.0
        for p in params:
            k, _, v = p.partition("=")
            if k.strip() == "q":
                try:
                    q = float(v)
                except ValueError:
                    q = 0.0
        best = max(best, 0.0 if q != q else q)
    return best


def prefers_flat(accept: str | None) -> bool:
    """True when the client asked for Flat Notation explicitly and prefers it to JSON.

    Wildcards (``*/*``) never count, so ordinary clients keep getting JSON.
    """
    if not accept:
        return False
    flat = _quality(accept, MEDIA_TYPE)
    return flat > 0 and flat >= _quality(accept, "application/json")


def is_flat_type(content_type: str | None) -> bool:
    return bool(content_type) and MEDIA_TYPE in content_type.lower()  # type: ignore[union-attr]


def add_vary(current: str | None) -> str:
    """Adds ``Accept`` to an existing ``Vary`` header value."""
    if not current:
        return "Accept"
    return current if any(v.strip().lower() == "accept" for v in current.split(",")) else f"{current}, Accept"
