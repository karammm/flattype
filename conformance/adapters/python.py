"""The conformance adapter for the flattype Python package.

node conformance/run.mjs -- uv run --project python python conformance/adapters/python.py
"""

from __future__ import annotations

import json
import sys
from typing import Any

import flattype


def answer(req: dict[str, Any]) -> dict[str, Any]:
    o = req["options"]
    try:
        if req["op"] == "decode":
            warnings: list[flattype.FlatWarning] = []
            value = flattype.decode(
                req["text"],
                strict=o["strict"],
                refs=o["refs"],
                skip_invalid_lines=o["skipInvalidLines"],
                on_warning=warnings.append,
            )
            return {"value": value, "warnings": [{"message": w.message, "line": w.line, "column": w.column} for w in warnings]}
        if req["op"] == "encode":
            options = {"delimiter": o["delimiter"], "indent": o["indent"], "tabular": o["tabular"], "refs": o["refs"], "target": o["target"]}
            return {"text": flattype.encode(req["value"], **options)}
        if req["op"] == "reencode":
            return {"text": flattype.encode(flattype.decode(req["text"], refs=True), refs=True, target=o["target"])}
        return {"unsupported": True}
    except flattype.FlatDecodeError as e:
        return {"error": {"message": e.reason, "line": e.line, "column": e.column}}


for line in sys.stdin:
    if line.strip():
        req = json.loads(line)
        sys.stdout.write(json.dumps({"id": req["id"], **answer(req)}) + "\n")
        sys.stdout.flush()
