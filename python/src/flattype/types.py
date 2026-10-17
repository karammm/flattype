"""Ready-made helpers for values JSON has no type for, the Python side of ``@flattype/core/types``.

They don't change the format, so the text stays readable and the JavaScript decoder reads it the same way::

    from flattype.types import default, revive_dates

    text = flattype.encode(data, default=default)  # datetime, bytes, set, UUID, Decimal, dataclasses...
    data = revive_dates(flattype.decode(text))  # date-time strings with a zone -> datetime

Integers need nothing: Python ints are exact, and ``decode(text, { bigint: true })`` reads them exactly in JavaScript.
"""

from __future__ import annotations

import base64
import dataclasses
import datetime as _dt
import enum
import re
import uuid
from decimal import Decimal
from pathlib import PurePath
from typing import Any

__all__ = ["default", "revive_dates"]

# Date and time with a zone, like the JavaScript reviveDates. Date-only strings stay strings.
_DATE_TIME = re.compile(r"^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:\.(\d{1,9}))?(?:(Z)|([+-])(\d{2}):(\d{2}))$")


def _iso(d: _dt.datetime) -> str:
    """Like JavaScript's ``toISOString()``: UTC with milliseconds, e.g. ``2026-01-01T09:00:00.000Z``."""
    if d.tzinfo is None or d.utcoffset() is None:
        # No zone to convert from: written as given, without a Z.
        return d.isoformat(timespec="milliseconds")
    return d.astimezone(_dt.timezone.utc).replace(tzinfo=None).isoformat(timespec="milliseconds") + "Z"


def default(obj: Any) -> Any:
    """``encode(x, default=default)``, like ``json.dumps(default=...)``, for the types JSON can't represent:

    - ``datetime`` -> ``2026-01-01T09:00:00.000Z`` (UTC, as JavaScript writes dates); ``date`` and ``time`` -> ISO
    - ``bytes``, ``bytearray``, ``memoryview`` -> base64 (read it back with the ``"bytes"`` model type)
    - ``set`` and ``frozenset`` -> a sorted list (in set order when the items can't be sorted)
    - ``Decimal`` -> an int when it is whole, otherwise a float
    - ``UUID``, paths -> ``str``; ``Enum`` -> its value; ``Exception`` -> ``{name, message}``
    - dataclasses, and Pydantic models (anything with ``model_dump``) -> dicts
    """
    if isinstance(obj, _dt.datetime):
        return _iso(obj)
    if isinstance(obj, (_dt.date, _dt.time)):
        return obj.isoformat()
    if isinstance(obj, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(obj)).decode("ascii")
    if isinstance(obj, (set, frozenset)):
        try:
            return sorted(obj)
        except TypeError:
            return list(obj)
    if isinstance(obj, Decimal):
        if not obj.is_finite():
            return None
        return int(obj) if obj == obj.to_integral_value() else float(obj)
    if isinstance(obj, (uuid.UUID, PurePath)):
        return str(obj)
    if isinstance(obj, enum.Enum):
        return obj.value
    if isinstance(obj, BaseException):
        return {"name": type(obj).__name__, "message": str(obj)}
    if dataclasses.is_dataclass(obj) and not isinstance(obj, type):
        return {f.name: getattr(obj, f.name) for f in dataclasses.fields(obj)}
    dump = getattr(obj, "model_dump", None)
    if callable(dump):
        return dump()
    raise TypeError(f"Object of type {type(obj).__name__} is not Flat Notation serializable")


def _parse(s: str) -> _dt.datetime | None:
    m = _DATE_TIME.match(s)
    if m is None:
        return None
    year, month, day, hour, minute, second, frac, z, sign, oh, om = m.groups()
    if z:
        tz = _dt.timezone.utc
    else:
        offset = _dt.timedelta(hours=int(oh), minutes=int(om))
        if offset >= _dt.timedelta(days=1):
            return None
        tz = _dt.timezone(-offset if sign == "-" else offset)
    try:
        return _dt.datetime(
            int(year), int(month), int(day), int(hour), int(minute), int(second or 0), int((frac or "").ljust(6, "0")[:6]), tz
        )
    except ValueError:
        return None


def revive_dates(value: Any) -> Any:
    """Returns ``value`` with every date-time string that has a zone, such as ``2026-01-01T09:00:00.000Z`` or
    ``2026-01-01T09:00:00.123456+00:00``, turned into an aware ``datetime``. Date-only strings stay strings.
    For per-field types, validate with Pydantic instead."""
    if isinstance(value, str):
        d = _parse(value)
        return value if d is None else d
    if not isinstance(value, (dict, list)):
        return value
    # Iterative, so deep documents can't hit the recursion limit.
    out: Any = {} if isinstance(value, dict) else []
    work: list[tuple[Any, Any]] = [(value, out)]
    while work:
        src, dst = work.pop()
        items = src.items() if isinstance(src, dict) else enumerate(src)
        for k, v in items:
            if isinstance(v, str):
                d = _parse(v)
                v = v if d is None else d
            elif isinstance(v, (dict, list)):
                child: Any = {} if isinstance(v, dict) else []
                work.append((v, child))
                v = child
            if isinstance(dst, dict):
                dst[k] = v
            else:
                dst.append(v)
    return out
