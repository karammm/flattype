"""Lexical rules shared by the encoder and decoder. Every rule matches @flattype/core exactly."""

from __future__ import annotations

import json
import math
import re
from typing import Any


class FlatDecodeError(ValueError):
    """Raised by :func:`decode` on malformed input, with the 1-based ``line`` and ``column`` of the problem."""

    def __init__(self, message: str, line: int, column: int) -> None:
        super().__init__(f"{message} (line {line}, column {column})")
        self.line = line
        self.column = column


#: Exactly the JSON number grammar (ASCII digits only). Anything else bare is a string.
NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?")
_BARE_KEY = re.compile(r"[A-Za-z0-9_$-]+")
_CONTROL = re.compile(r"[\x00-\x1f]")

#: The characters JavaScript's String#trim removes (WhiteSpace and LineTerminator).
JS_SPACE = "\t\n\v\f\r                  　﻿"

#: CPython refuses (or takes quadratic time) to convert very long digit strings to int.
_MAX_INT_DIGITS = 4300


def js_trim(s: str) -> str:
    return s.strip(JS_SPACE)


def is_key_char(c: str) -> bool:
    """Characters allowed in an unquoted key: A-Z a-z 0-9 _ $ -"""
    return ("a" <= c <= "z") or ("A" <= c <= "Z") or ("0" <= c <= "9") or c in "_$-"


_ESCAPES = {'"': '\\"', "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}
_NEEDS_ESCAPE = re.compile('["\\\\\x00-\x1f\ud800-\udfff]')


def _escape(m: re.Match[str]) -> str:
    c = m.group()
    return _ESCAPES.get(c) or f"\\u{ord(c):04x}"


def quote(s: str) -> str:
    """A JSON string literal, byte for byte what JavaScript's JSON.stringify writes (lone surrogates escaped)."""
    return '"' + _NEEDS_ESCAPE.sub(_escape, s) + '"'


def format_key(key: str) -> str:
    return key if _BARE_KEY.fullmatch(key) else quote(key)


def join_key(path: str, key: str) -> str:
    return format_key(key) if path == "" else path + "." + format_key(key)


def format_string(s: str, delimiter: str | None = None) -> str:
    """Writes a string bare when it can't be mistaken for anything else, quoted (JSON style) otherwise."""
    if (
        s == ""
        or s[0] == '"'
        or s != js_trim(s)
        or s in ("null", "true", "false", "{}", "[]")
        or NUMBER.fullmatch(s)
        or _CONTROL.search(s)
        or (delimiter is not None and delimiter in s)
    ):
        return quote(s)
    return s


def format_number(x: float) -> str:
    """Formats a number the way JavaScript does (``1e+21``, ``1e-7``, ``100``), so both libraries write the same text.

    Integers are written exactly. Floats use the shortest round-trip digits, like ``repr``, laid out by the
    ECMAScript Number::toString rules. ``NaN`` and infinities become ``null``, as in JSON.
    """
    if isinstance(x, int):
        return str(x)
    if not math.isfinite(x):
        return "null"
    if x == 0:
        return "0"
    r = repr(abs(x))
    mant, _, exp = r.partition("e")
    whole, _, frac = mant.partition(".")
    digits = whole + frac
    n = len(whole) + (int(exp) if exp else 0)  # x = 0.digits * 10**n
    stripped = digits.lstrip("0")
    n -= len(digits) - len(stripped)
    digits = stripped.rstrip("0")
    k = len(digits)
    if k <= n <= 21:
        out = digits + "0" * (n - k)
    elif 0 < n <= 21:
        out = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        out = "0." + "0" * -n + digits
    else:
        e = n - 1
        sign = "+" if e >= 0 else "-"
        out = (digits if k == 1 else digits[0] + "." + digits[1:]) + "e" + sign + str(abs(e))
    return "-" + out if x < 0 else out


def format_primitive(v: Any, delimiter: str | None = None) -> str:
    if isinstance(v, str):
        return format_string(v, delimiter)
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    if isinstance(v, int):
        return str(int(v))
    return format_number(float(v))


def to_number(tok: str) -> int | float:
    """A token that matched NUMBER: an int when it has no fraction or exponent, otherwise a float."""
    if "." in tok or "e" in tok or "E" in tok or len(tok) > _MAX_INT_DIGITS:
        return float(tok)
    return int(tok)


#: Returned by parse_scalar for a malformed quoted token.
INVALID = object()


def parse_scalar(tok: str) -> Any:
    """Parses one trimmed bare or quoted token. Returns ``INVALID`` when a quoted token is malformed."""
    if tok == "null":
        return None
    if tok == "true":
        return True
    if tok == "false":
        return False
    if tok == "{}":
        return {}
    if tok == "[]":
        return []
    if tok[:1] == '"':
        try:
            v = json.loads(tok)
        except ValueError:
            return INVALID
        return v if isinstance(v, str) else INVALID
    return to_number(tok) if NUMBER.fullmatch(tok) else tok


_QUOTE_OR_BACKSLASH = re.compile(r'["\\]')


def scan_string(s: str, start: int) -> int:
    """Index of the closing quote of the JSON string starting at ``start``, or -1."""
    i = start + 1
    while True:
        m = _QUOTE_OR_BACKSLASH.search(s, i)
        if m is None:
            return -1
        j = m.start()
        if s[j] == '"':
            return j
        i = j + 2  # skip the escaped character
