"""FlatType for Python: JSON <-> Flat Notation, the compact ``key: value`` format of the @flattype/* npm packages.

>>> import flattype
>>> print(flattype.encode({"name": "John", "age": 30, "city": "New York"}))
name: John
age: 30
city: New York
>>> flattype.decode("name: John\\nage: 30")
{'name': 'John', 'age': 30}
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from ._decode import Decoder, TableRow, decode
from ._encode import encode
from ._flatten import flatten, unflatten
from ._syntax import FlatDecodeError, FlatWarning

__all__ = [
    "MEDIA_TYPE",
    "CONTENT_TYPE",
    "Decoder",
    "FlatDecodeError",
    "FlatStats",
    "FlatWarning",
    "TableRow",
    "decode",
    "dumps",
    "encode",
    "flatten",
    "loads",
    "stats",
    "unflatten",
]

__version__ = "1.13.0"

#: Media type for Flat Notation over HTTP.
MEDIA_TYPE = "text/x-flat"
#: ``Content-Type`` for Flat Notation responses.
CONTENT_TYPE = "text/x-flat; charset=utf-8"

#: ``json``-style aliases.
dumps = encode
loads = decode


@dataclass(frozen=True)
class FlatStats:
    json_bytes: int
    flat_bytes: int
    #: Fraction saved, e.g. 0.45 for 45% smaller than minified JSON.
    saved: float


def stats(value: Any, **options: Any) -> FlatStats:
    """UTF-8 size of ``value`` as minified JSON and as Flat Notation."""
    j = len(json.dumps(value, separators=(",", ":"), ensure_ascii=False).encode("utf-8", "surrogatepass"))
    f = len(encode(value, **options).encode("utf-8", "surrogatepass"))
    return FlatStats(j, f, 0.0 if j == 0 else 1 - f / j)
