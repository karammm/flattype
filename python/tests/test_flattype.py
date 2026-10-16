from __future__ import annotations

import json
import math
import re
from datetime import date
from pathlib import Path
from typing import Any

import pytest
from conftest import same
from hypothesis import given, settings
from hypothesis import strategies as st

import flattype
from flattype import FlatDecodeError, decode, encode


def test_readme_example() -> None:
    assert encode({"name": "John", "age": 30, "city": "New York"}) == "name: John\nage: 30\ncity: New York"
    users = {
        "page": 1,
        "users": [
            {"id": 1, "name": "Alice", "address": {"city": "Paris"}},
            {"id": 2, "name": "Bob", "address": {"city": "Delhi"}},
        ],
    }
    text = encode(users)
    assert text == "page: 1\nusers[2]{id,name,address.city}:\n  1, Alice, Paris\n  2, Bob, Delhi"
    assert decode(text) == users


def test_python_types() -> None:
    assert encode({"t": (1, 2), 1: "int key", None: True}) == "t[]: 1, 2\n1: int key\nnull: true"
    assert (
        encode({"x": math.nan, "y": math.inf, "z": 30.0, "big": 2**70}) == "x: null\ny: null\nz: 30\nbig: 1180591620717411303424"
    )
    assert decode("big: 1180591620717411303424")["big"] == 2**70
    assert decode("a: 1.5\nb: 1e3\nc: 7") == {"a": 1.5, "b": 1000.0, "c": 7}
    assert isinstance(decode("c: 7")["c"], int)


def test_default_like_json() -> None:
    with pytest.raises(TypeError, match="date is not Flat Notation serializable"):
        encode({"d": date(2024, 1, 2)})
    assert (
        encode({"d": date(2024, 1, 2), "s": {1, 2}}, default=lambda o: o.isoformat() if isinstance(o, date) else sorted(o))
        == "d: 2024-01-02\ns[]: 1, 2"
    )


def test_cycles_and_refs() -> None:
    a: dict[str, Any] = {"n": 1}
    a["me"] = a
    with pytest.raises(ValueError, match="refs=True"):
        encode(a)
    assert encode(a, refs=True) == "n: 1\nme = ~"
    shared = {"id": 1}
    assert encode({"x": shared, "y": shared}) == "x.id: 1\ny.id: 1"
    assert encode({"x": shared, "y": shared}, refs=True) == "x.id: 1\ny = x"
    back = decode("x.id: 1\ny = x", refs=True)
    assert back["y"] is back["x"]
    with pytest.raises(FlatDecodeError, match="References need"):
        decode("x.id: 1\ny = x")
    assert decode("x.id: 1\ny = x", strict=False) == {"x": {"id": 1}}
    t = (1, 2)
    assert encode({"a": t, "b": t}, refs=True) == "a[]: 1, 2\nb[]: 1, 2"  # tuples are values, never references


def test_errors_have_positions() -> None:
    with pytest.raises(FlatDecodeError) as e:
        decode("a: 1\nb c: 2")
    assert (e.value.line, e.value.column) == (2, 2)
    assert isinstance(e.value, ValueError)


def test_lenient_gap_is_bounded() -> None:
    assert decode("a[2]: 1", strict=False) == {"a": [None, None, 1]}
    with pytest.raises(FlatDecodeError, match="too far"):
        decode("a[999999999]: 1", strict=False)


def test_long_integers_dont_hang() -> None:
    v = decode("a: " + "1" * 100_000)["a"]
    assert v == math.inf


def test_on_row_streaming() -> None:
    rows: list[flattype.TableRow] = []
    d = flattype.Decoder(on_row=rows.append, keep_rows=False)
    d.write("t[2]{id}:\n  1\n")
    assert rows == [flattype.TableRow("t", 0, {"id": 1})]
    d.write("  2\nx: 1")
    assert d.end() == {"t": [], "x": 1}
    assert len(rows) == 2


def test_flatten_and_stats() -> None:
    v = {"user": {"name": "John"}, "tags": ["a"], "e": {}, "l": []}
    flat = flattype.flatten(v)
    assert flat == {"user.name": "John", "tags[0]": "a", "e": {}, "l": []}
    assert flattype.unflatten(flat) == v
    s = flattype.stats({"users": [{"id": i, "name": "x"} for i in range(50)]})
    assert s.flat_bytes < s.json_bytes and 0.3 < s.saved < 0.9


def test_aliases() -> None:
    assert flattype.dumps is encode and flattype.loads is decode


json_values = st.recursive(
    st.none() | st.booleans() | st.integers() | st.floats(allow_nan=False, allow_infinity=False) | st.text(),
    lambda children: st.lists(children, max_size=4) | st.dictionaries(st.text(max_size=5), children, max_size=4),
    max_leaves=20,
)


@settings(max_examples=500)
@given(json_values, st.sampled_from([{}, {"tabular": False}, {"delimiter": "|"}, {"delimiter": "\t"}, {"indent": 0}]))
def test_round_trip(value: Any, options: dict[str, Any]) -> None:
    expected = json.loads(json.dumps(value))
    assert same(decode(encode(value, **options)), expected)


flatish = st.lists(
    st.sampled_from(
        [
            "a",
            "b.c",
            "[0]",
            "[1]",
            "[]",
            "[2]{x,y}",
            "{",
            "}",
            ":",
            ": ",
            ", ",
            "|",
            "\t",
            '"',
            '\\"',
            "\\",
            "#",
            " ",
            "\n",
            "\r\n",
            "null",
            "1",
            "[",
            "]",
            ".",
            " = ",
            "~",
            "a = b",
        ]
    )
    | st.text(max_size=3),
    max_size=30,
).map("".join)


@settings(max_examples=2000)
@given(flatish, st.booleans(), st.booleans())
def test_only_flat_decode_error(text: str, strict: bool, refs: bool) -> None:
    try:
        decode(text, strict=strict, refs=refs)
    except FlatDecodeError:
        pass


def test_version_is_in_lockstep_with_npm() -> None:
    root = Path(__file__).parents[2]
    npm = json.loads((root / "packages" / "core" / "package.json").read_text("utf-8"))["version"]
    pyproject = re.search(r'^version = "(.+)"', (root / "python" / "pyproject.toml").read_text("utf-8"), re.M)
    assert pyproject and flattype.__version__ == pyproject.group(1) == npm
