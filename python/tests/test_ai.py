from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from conftest import same

from flattype.ai import (
    LEGEND,
    ModelOutputError,
    claude_tool_result,
    count_tokens,
    from_model_output,
    output_instructions,
    to_prompt,
    tool_result,
)

CASES = json.loads((Path(__file__).parents[2] / "conformance" / "llm.json").read_text("utf-8"))


@pytest.mark.parametrize("case", CASES["prompts"], ids=lambda c: repr(c["options"]))
def test_to_prompt_matches_js(case: dict[str, Any]) -> None:
    assert to_prompt(case["value"], **case["options"]) == case["text"]


def test_output_instructions_match_js() -> None:
    plain, with_example = CASES["instructions"]
    assert output_instructions() == plain["text"]
    assert output_instructions(with_example["example"]) == with_example["text"]


@pytest.mark.parametrize("case", CASES["replies"], ids=lambda c: repr(c["text"])[:40])
def test_from_model_output_matches_js(case: dict[str, Any]) -> None:
    if "error" in case:
        with pytest.raises(ModelOutputError):
            from_model_output(case["text"])
        return
    warnings: list[Any] = []
    assert same(from_model_output(case["text"], on_warning=warnings.append), case["value"])
    assert [{"message": w.message, "line": w.line, "column": w.column} for w in warnings] == case["warnings"]


def test_broken_json_says_where() -> None:
    reply = 'Here:\n```json\n[{"name": "Noa","language" "Galician"}]\n```'
    with pytest.raises(ModelOutputError) as e:
        from_model_output(reply)
    assert (e.value.line, e.value.column) == (1, 28)
    assert str(e.value) == 'The data is JSON, but it is broken at line 1, column 28: [{"name": "Noa","language" ⟶ "Galician"}]'


def test_validates_with_a_model() -> None:
    pydantic = pytest.importorskip("pydantic")

    class Order(pydantic.BaseModel):
        id: int
        customer: str

    reply = "Here you go:\n<data>\n[2]{id,customer}:\n  1, Alice\n  2, Bob\n</data>"
    orders = from_model_output(reply, Order, many=True)
    assert orders == [Order(id=1, customer="Alice"), Order(id=2, customer="Bob")]
    assert from_model_output("id: 3\ncustomer: Chen", Order) == Order(id=3, customer="Chen")
    assert from_model_output("a: 1", dict) == {"a": 1}


def test_tool_results() -> None:
    assert tool_result({"a": 1}) == {"content": [{"type": "text", "text": to_prompt({"a": 1})}]}
    assert tool_result({"a": 1}, structured=True, is_error=True)["structuredContent"] == {"a": 1}
    block = claude_tool_result("toolu_1", [1, 2], legend=False)
    assert block == {
        "type": "tool_result",
        "tool_use_id": "toolu_1",
        "content": '<data format="flat-notation">\n[]: 1, 2\n</data>',
    }
    assert LEGEND.startswith("# Flat Notation")


def test_count_tokens_with_a_fake_client() -> None:
    calls: list[dict[str, Any]] = []

    def count(**kwargs: Any) -> Any:
        calls.append(kwargs)
        return SimpleNamespace(input_tokens=8 + len(kwargs["messages"][0]["content"]) // 4)

    client = SimpleNamespace(messages=SimpleNamespace(count_tokens=count))
    report = count_tokens(client, {"users": [{"id": i, "name": "x"} for i in range(30)]})
    assert report["model"] == "claude-opus-5-5" and calls[0]["model"] == "claude-opus-5-5"
    assert 0 < report["flat"] < report["json"] and report["saved"] > 0
