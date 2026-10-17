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
    assert len(CASES["encode"]) > 500 and len(CASES["decode"]) > 1000 and len(CASES["refs"]) > 100 and len(CASES["bigint"]) >= 100


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


@pytest.mark.parametrize("case", CASES["bigint"], ids=lambda c: repr(c["text"])[:40])
def test_integers_of_any_size_are_exact(case: dict[str, Any]) -> None:
    # Compared with ==, not same(): every digit has to match.
    assert flattype.encode(case["value"]) == case["text"]
    assert flattype.decode(case["text"]) == case["value"]


FROZEN = json.loads((Path(__file__).parents[2] / "conformance" / "1.0" / "cases.json").read_text("utf-8"))
_RENAMED = ("A '.' path needs a [+] item before it", "Expected ':' after path")


def test_target_1_0_writes_the_frozen_1_0_text() -> None:
    for case in FROZEN["encode"]:
        assert flattype.encode(case["value"], **_encode_options(case["options"]), target="1.0") == case["text"]
    for case in FROZEN["bigint"]:
        assert flattype.encode(case["value"], target="1.0") == case["text"]


def test_every_1_0_document_means_the_same() -> None:
    # 1.1 only adds syntax. Lines starting with "." were errors and still are, with a clearer message.
    for case in FROZEN["decode"]:
        o = case["options"]
        kwargs = {
            "strict": o.get("strict", True),
            "refs": o.get("refs", False),
            "skip_invalid_lines": o.get("skipInvalidLines", False),
        }
        warnings: list[flattype.FlatWarning] = []
        try:
            value = flattype.decode(case["text"], **kwargs, on_warning=warnings.append)
        except flattype.FlatDecodeError as e:
            assert str(e).replace(*_RENAMED) == case["error"]
            continue
        assert "error" not in case and same(value, case["value"])
        if "warnings" in case:
            assert [{"message": w.message.replace(*_RENAMED), "line": w.line, "column": w.column} for w in warnings] == case[
                "warnings"
            ]
