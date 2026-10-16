"""Linear-time checks on hostile inputs: 8x the input must take well under 64x the time (what a quadratic
algorithm would take). Not collected by default; run alone with ``pytest tests/perf_linear.py``."""

from __future__ import annotations

import time
from typing import Callable

import pytest

from flattype import Decoder, decode, encode
from flattype.ai import from_model_output


def expect_linear(run: Callable[[int], object], n: int = 20_000) -> None:
    def measure(size: int) -> float:
        run(size)  # warm up
        best = float("inf")
        for _ in range(5):
            t = time.perf_counter()
            run(size)
            best = min(best, time.perf_counter() - t)
        return max(best, 5e-5)

    ratio = measure(n * 8) / measure(n)
    assert ratio < 30, f"8x input took {ratio:.1f}x as long"


def stream_one_long_line(n: int) -> None:
    d = Decoder()
    d.write("a: ")
    for _ in range(n):
        d.write("x")
    d.end()


CASES: dict[str, Callable[[int], object]] = {
    "long digit run": lambda n: decode(f"a: {'1' * n}x"),
    "long integer": lambda n: decode(f"a: {'1' * n}"),
    "escapes": lambda n: decode('a: "' + '\\"' * n + '"'),
    "many cells": lambda n: decode("a[]: " + "1, " * n + "1"),
    "unclosed quotes, lenient": lambda n: decode("a[]: " + '", ' * n, strict=False),
    "deep path": lambda n: decode("a." * n + "b: 1"),
    "many lines": lambda n: decode("".join(f"k{i}: 1\n" for i in range(n))),
    "long table": lambda n: decode(encode({"t": [{"id": i, "s": "v"} for i in range(n)]})),
    "one long line in tiny chunks": stream_one_long_line,
    "many references": lambda n: decode("a.x: 1\n" + "\n".join(f"b[{i}] = a" for i in range(n)), refs=True),
    "many shared objects": lambda n: encode({"l": [{"id": 1}] * n}, refs=True),
    "model reply: many prose lines": lambda n: from_model_output("this is prose\n" * n + "a: 1"),
    "model reply: many <data openers": lambda n: from_model_output("<data>" * n),
    "model reply: many openers, one closer": lambda n: from_model_output("<data " * n + "a: 1</data>"),
    "model reply: lookalike tags": lambda n: from_model_output("<database>" * n + "</data>"),
    "model reply: many fences": lambda n: from_model_output("```" * n),
}


@pytest.mark.parametrize("name", CASES)
def test_linear(name: str) -> None:
    expect_linear(CASES[name], 2_000 if name in ("deep path", "long integer") else 20_000)
