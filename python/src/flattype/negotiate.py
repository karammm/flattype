"""Content negotiation, with the same rules as ``@flattype/http``."""

from __future__ import annotations

import re

MEDIA_TYPE = "text/x-flat"
#: The ``Accept`` header a client sends: Flat Notation first (saying it reads version 1.1), JSON as the fallback.
#: Clients before 1.14 send no version, so servers write 1.0 text for them.
ACCEPT = f"{MEDIA_TYPE}; version=1.1, application/json;q=0.9, */*;q=0.1"

_VERSION = re.compile(r'\s*"?(\d+)\.(\d+)')


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


def flat_version(accept: str | None) -> str:
    """The Flat Notation version a client reads, from the ``version`` parameter of ``text/x-flat`` in its ``Accept``
    header: ``"1.1"`` for ``version=1.1`` or later, otherwise ``"1.0"``."""
    for part in (accept or "").split(","):
        media, *params = part.strip().split(";")
        if media.strip().lower() != MEDIA_TYPE:
            continue
        for p in params:
            k, _, v = p.partition("=")
            m = _VERSION.match(v) if k.strip().lower() == "version" else None
            if m and (int(m[1]) > 1 or int(m[2]) >= 1):
                return "1.1"
    return "1.0"


def is_flat_type(content_type: str | None) -> bool:
    return bool(content_type) and MEDIA_TYPE in content_type.lower()  # type: ignore[union-attr]


def add_vary(current: str | None) -> str:
    """Adds ``Accept`` to an existing ``Vary`` header value."""
    if not current:
        return "Accept"
    return current if any(v.strip().lower() == "accept" for v in current.split(",")) else f"{current}, Accept"
