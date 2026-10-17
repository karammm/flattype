"""The cases in conformance/cases.json come from @flattype/core. Python must write and read exactly the same."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from conftest import same

import flattype

CASES = json.loads((Path(__file__).parents[2] / "conformance" / "cases.json").read_text("utf-8"))


def _encode_options(o: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in o.items() if k != "tabular"}
    if o.get("tabular") == "off":
        out["tabular"] = False
    return out


def test_there_are_cases() -> None:
    assert len(CASES["encode"]) > 500 and len(CASES["decode"]) > 1000 and len(CASES["refs"]) > 100


@pytest.mark.parametrize("case", CASES["encode"], ids=lambda c: repr(c["text"])[:40])
def test_encode_writes_the_same_text(case: dict[str, Any]) -> None:
    text = flattype.encode(case["value"], **_encode_options(case["options"]))
    assert text == case["text"]
    assert same(flattype.decode(text), case["value"])


@pytest.mark.parametrize("case", CASES["decode"], ids=lambda c: repr(c["text"])[:40])
def test_decode_reads_the_same_value_or_error(case: dict[str, Any]) -> None:
    o = case["options"]
    kwargs = {
        "strict": o.get("strict", True),
        "refs": o.get("refs", False),
        "skip_invalid_lines": o.get("skipInvalidLines", False),
    }
    if "error" in case:
        with pytest.raises(flattype.FlatDecodeError) as e:
            flattype.decode(case["text"], **kwargs)
        assert str(e.value) == case["error"]
    else:
        warnings: list[flattype.FlatWarning] = []
        assert same(flattype.decode(case["text"], **kwargs, on_warning=warnings.append), case["value"])
        if "warnings" in case:
            assert [{"message": w.message, "line": w.line, "column": w.column} for w in warnings] == case["warnings"]


@pytest.mark.parametrize("case", CASES["refs"], ids=lambda c: repr(c["text"])[:40])
def test_reference_graphs_round_trip(case: dict[str, Any]) -> None:
    graph = flattype.decode(case["text"], refs=True)
    assert flattype.encode(graph, refs=True) == case["text"]
    assert graph["first"] is graph["nodes"][0]


def test_streaming_matches_whole() -> None:
    for case in CASES["encode"][:200]:
        text = case["text"]
        for size in (1, 3, 7):
            d = flattype.Decoder()
            for i in range(0, len(text), size):
                d.write(text[i : i + size])
            assert same(d.end(), flattype.decode(text))
