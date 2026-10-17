"""Starlette / FastAPI response class that always answers in Flat Notation. Needs ``pip install flattype[starlette]``.

    from flattype.starlette import FlatResponse

    @app.get("/users", response_class=FlatResponse)
    def users():
        return [{"id": 1, "name": "Alice"}]

To answer in Flat Notation only when the client asks for it, use :class:`flattype.asgi.FlatMiddleware` instead.
"""

from __future__ import annotations

from typing import Any

from starlette.responses import Response

from ._encode import encode


class FlatResponse(Response):
    media_type = "text/x-flat"
    charset = "utf-8"
    #: The Flat Notation version written. 1.0, because this class can't see which version the client reads (every
    #: client can read 1.0). Subclass with ``target = "1.1"`` when all clients are on 1.14 or later.
    target = "1.0"

    def render(self, content: Any) -> bytes:
        return encode(content, target=self.target).encode("utf-8")
