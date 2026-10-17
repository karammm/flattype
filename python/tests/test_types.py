from __future__ import annotations

import dataclasses
import datetime as dt
import enum
import uuid
from decimal import Decimal
from pathlib import PurePosixPath

import pytest

import flattype
from flattype.types import default, revive_dates

BIG = 2**64 + 1


def test_big_integers_are_exact_both_ways() -> None:
    text = flattype.encode({"id": BIG, "ids": [BIG, -BIG], "rows": [{"id": BIG}, {"id": 2}]})
    # The same text the JavaScript encoder writes for BigInts.
    assert text == (
        "id: 18446744073709551617\nids[]: 18446744073709551617, -18446744073709551617\nrows[2]{id}:\n  18446744073709551617\n  2"
    )
    assert flattype.decode(text)["rows"][0]["id"] == BIG


class Color(enum.Enum):
    RED = "red"


@dataclasses.dataclass
class Point:
    x: int
    y: int


def test_default_writes_the_same_text_as_replace_types() -> None:
    value = {
        "when": dt.datetime(2026, 1, 1, 10, 0, 0, 123456, tzinfo=dt.timezone(dt.timedelta(hours=1))),
        "naive": dt.datetime(2026, 1, 1, 9, 0),
        "day": dt.date(2026, 1, 1),
        "at": dt.time(9, 30),
        "avatar": b"hi\xff",
        "buf": bytearray(b"hi"),
        "tags": {"b", "a"},
        "mixed": frozenset([1]),
        "price": Decimal("9.50"),
        "count": Decimal("3"),
        "id": uuid.UUID("12345678-1234-5678-1234-567812345678"),
        "path": PurePosixPath("/tmp/x"),
        "color": Color.RED,
        "error": ValueError("boom"),
        "point": Point(1, 2),
    }
    assert flattype.encode(value, default=default) == "\n".join(
        [
            "when: 2026-01-01T09:00:00.123Z",
            "naive: 2026-01-01T09:00:00.000",
            "day: 2026-01-01",
            "at: 09:30:00",
            "avatar: aGn/",
            "buf: aGk=",
            "tags[]: a, b",
            "mixed[]: 1",
            "price: 9.5",
            "count: 3",
            "id: 12345678-1234-5678-1234-567812345678",
            "path: /tmp/x",
            "color: red",
            "error.name: ValueError",
            "error.message: boom",
            "point.x: 1",
            "point.y: 2",
        ]
    )


def test_default_handles_pydantic_style_models_and_refuses_the_rest() -> None:
    class Model:
        def model_dump(self) -> dict[str, object]:
            return {"at": dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)}

    assert flattype.encode({"m": Model()}, default=default) == "m.at: 2026-01-01T00:00:00.000Z"
    assert flattype.encode({"s": {1, "a"}}, default=default) in ("s[]: 1, a", "s[]: a, 1")
    assert default(Decimal("NaN")) is None
    with pytest.raises(TypeError, match="not Flat Notation serializable"):
        flattype.encode({"x": object()}, default=default)


def test_revive_dates() -> None:
    utc = dt.timezone.utc
    data = flattype.decode(
        flattype.encode(
            {
                "js": "2026-01-01T09:00:00.000Z",
                "python": "2026-01-01T09:00:00.123456+00:00",
                "offset": "2026-01-01T10:00+01:00",
                "nanos": "2026-01-01T09:00:00.123456789Z",
                "dateOnly": "2026-01-01",
                "noZone": "2026-01-01T09:00:00",
                "invalid": "2026-13-45T99:00:00Z",
                "deep": [{"at": "2026-01-01T09:00:00Z"}],
            }
        )
    )
    assert revive_dates(data) == {
        "js": dt.datetime(2026, 1, 1, 9, tzinfo=utc),
        "python": dt.datetime(2026, 1, 1, 9, 0, 0, 123456, tzinfo=utc),
        "offset": dt.datetime(2026, 1, 1, 9, tzinfo=utc),
        "nanos": dt.datetime(2026, 1, 1, 9, 0, 0, 123456, tzinfo=utc),
        "dateOnly": "2026-01-01",
        "noZone": "2026-01-01T09:00:00",
        "invalid": "2026-13-45T99:00:00Z",
        "deep": [{"at": dt.datetime(2026, 1, 1, 9, tzinfo=utc)}],
    }
    assert revive_dates("2026-01-01T09:00Z") == dt.datetime(2026, 1, 1, 9, tzinfo=utc)
    assert revive_dates(5) == 5


def test_revive_dates_is_iterative() -> None:
    deep: object = "2026-01-01T09:00:00Z"
    for _ in range(5000):
        deep = [deep]
    out = revive_dates(deep)
    for _ in range(5000):
        out = out[0]
    assert out == dt.datetime(2026, 1, 1, 9, tzinfo=dt.timezone.utc)
