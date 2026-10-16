"""Flat Notation for LLM prompts and replies: the Python side of ``@flattype/ai``.

from flattype.ai import to_prompt, from_model_output

content = f"{to_prompt(orders, name='orders')}\\n\\nWhich customer spent the most?"
rows = from_model_output(reply_text)
"""

from __future__ import annotations

import json
import re
from typing import Any, Callable, Protocol

from ._decode import decode
from ._encode import encode

__all__ = ["LEGEND", "claude_tool_result", "count_tokens", "from_model_output", "output_instructions", "to_prompt", "tool_result"]

#: One line that teaches a model the format. It is a ``#`` comment, so a block that includes it is still valid.
LEGEND = (
    "# Flat Notation: one `path: value` per line. `a.b` is a nested key, `a[0]` an array index, `a[]: x, y` a list. "
    "`t[N]{f,g}:` is a table: N rows follow, one per line, values in field order. Quoted values are JSON strings."
)


def _attr(s: str) -> str:
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


def to_prompt(value: Any, *, name: str | None = None, legend: bool = True, tag: bool = True, **encode_options: Any) -> str:
    """Formats data for an LLM prompt: Flat Notation inside a ``<data>`` tag, with a one-line legend.

    :param name: adds ``name="..."`` to the tag, so a prompt can refer to several data blocks.
    :param legend: include the format legend. Turn it off once a system prompt explains the format.
    :param tag: wrap in ``<data format="flat-notation">...</data>``.
    """
    body = (LEGEND + "\n" if legend else "") + encode(value, **encode_options)
    if not tag:
        return body
    return f'<data format="flat-notation"{f" name={chr(34)}{_attr(name)}{chr(34)}" if name else ""}>\n{body}\n</data>'


def output_instructions(example: Any = None) -> str:
    """Instructions that ask a model to answer in Flat Notation, with an example of the shape you expect."""
    lines = [
        "Reply with the data only, in Flat Notation, inside <data> and </data> tags.",
        LEGEND[2:],
        "Write a list of objects with the same keys as a table. Quote a string value if it contains a comma "
        "or could be read as a number, true, false or null.",
    ]
    if example is not None:
        lines += ["Example of the expected shape:", to_prompt(example, legend=False)]
    return "\n".join(lines)


_WORD = re.compile(r"[\w-]", re.ASCII)
_JSON_LANG = re.compile(r"json", re.I)


def _extract(text: str) -> tuple[str, bool]:
    """The last ``<data>...</data>`` block, else the last fenced block, else the whole text. Linear scans only."""
    lower = text.lower()
    close = lower.rfind("</data>")
    if close >= 0:
        opening = lower.rfind("<data", 0, close + 5)
        # `<data` must be the tag itself, not e.g. `<database>`.
        while opening >= 0 and _WORD.match(lower[opening + 5 : opening + 6] or " "):
            opening = lower.rfind("<data", 0, opening + 4) if opening > 0 else -1
        gt = text.find(">", opening) if opening >= 0 else -1
        if 0 <= gt < close:
            return text[gt + 1 : close], False
    fences: list[int] = []
    i = text.find("```")
    while i >= 0:
        fences.append(i)
        i = text.find("```", i + 3)
    if len(fences) >= 2:
        last = len(fences) - 2 if len(fences) % 2 == 0 else len(fences) - 3
        start, end = fences[last], fences[last + 1]
        nl = text.find("\n", start)
        if 0 <= nl < end:
            lang = text[start + 3 : nl].strip()
            return text[nl + 1 : end], bool(_JSON_LANG.match(lang))
    return text, False


def from_model_output(text: str, model: Callable[[Any], Any] | None = None, *, many: bool = False) -> Any:
    """Reads data out of an LLM reply, tolerating what models actually send: ``<data>`` tags or code fences around
    it, prose before or after, small format slips, or plain JSON instead.

    :param model: validates the result, e.g. a Pydantic model class (``model_validate`` is used) or any callable.
    :param many: the data is a list; ``model`` is applied to each item.
    """
    body, is_json = _extract(text)
    trimmed = body.strip()
    value: Any = None
    parsed = False
    if is_json or trimmed[:1] in ("[", "{"):
        try:
            value = json.loads(trimmed)
            parsed = True
        except ValueError:
            pass
    if not parsed:
        # Lenient, and lines that aren't Flat Notation (prose like "Here are the results:") are dropped.
        value = decode(body, strict=False, skip_invalid_lines=True)
    if model is None:
        return value
    validate = getattr(model, "model_validate", model)
    return [validate(v) for v in value] if many else validate(value)


class _Counter(Protocol):
    def count_tokens(self, *, model: str, messages: list[dict[str, str]]) -> Any: ...


class _Client(Protocol):
    @property
    def messages(self) -> _Counter: ...


def count_tokens(client: _Client, value: Any, *, model: str = "claude-opus-5-5", **prompt_options: Any) -> dict[str, Any]:
    """Tokens for ``value`` as minified JSON and as :func:`to_prompt` text, counted by Claude's token counter.

    ``client`` is an ``anthropic.Anthropic()``. Counting is free. Returns ``{"model", "json", "flat", "saved"}``.
    """

    def count(content: str) -> int:
        return int(client.messages.count_tokens(model=model, messages=[{"role": "user", "content": content}]).input_tokens)

    # "." is one token; what's left is the message framing both counts share.
    base = max(0, count(".") - 1)
    j = count(json.dumps(value, separators=(",", ":"), ensure_ascii=False)) - base
    f = count(to_prompt(value, **prompt_options)) - base
    return {"model": model, "json": j, "flat": f, "saved": 0.0 if j == 0 else 1 - f / j}


def tool_result(value: Any, *, is_error: bool = False, structured: bool = False, **prompt_options: Any) -> dict[str, Any]:
    """An MCP tool result whose text is the data as Flat Notation (compatible with the ``mcp`` SDK's ``CallToolResult``)."""
    result: dict[str, Any] = {"content": [{"type": "text", "text": to_prompt(value, **prompt_options)}]}
    if structured and isinstance(value, dict):
        result["structuredContent"] = json.loads(json.dumps(value))
    if is_error:
        result["isError"] = True
    return result


def claude_tool_result(tool_use_id: str, value: Any, *, is_error: bool = False, **prompt_options: Any) -> dict[str, Any]:
    """A Claude API ``tool_result`` block whose content is the data as Flat Notation."""
    block: dict[str, Any] = {"type": "tool_result", "tool_use_id": tool_use_id, "content": to_prompt(value, **prompt_options)}
    if is_error:
        block["is_error"] = True
    return block
