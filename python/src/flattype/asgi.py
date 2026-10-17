"""ASGI middleware for FastAPI, Starlette, Litestar, Quart or any ASGI app. No dependencies.

    from flattype.asgi import FlatMiddleware
    app.add_middleware(FlatMiddleware)

JSON responses are re-encoded as Flat Notation when the client asks for ``text/x-flat`` (and prefers it to
JSON). Everyone else gets the JSON unchanged. ``Vary: Accept`` is always added so caches keep the two apart.
"""

from __future__ import annotations

import json
import re
from collections.abc import Awaitable, MutableMapping
from typing import Any, Callable

from ._encode import encode
from .negotiate import add_vary, flat_version, prefers_flat

Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

_JSON = re.compile(r"[/+]json\b", re.I)
CONTENT_TYPE = b"text/x-flat; charset=utf-8"


def _header(headers: list[tuple[bytes, bytes]], name: bytes) -> bytes | None:
    for k, v in headers:
        if k.lower() == name:
            return v
    return None


def _without(headers: list[tuple[bytes, bytes]], *names: bytes) -> list[tuple[bytes, bytes]]:
    return [(k, v) for k, v in headers if k.lower() not in names]


class FlatMiddleware:
    """Answers in Flat Notation when the client asks for it. Encode options (``delimiter``, ``indent``, ``tabular``)
    are passed to :func:`flattype.encode`. The text is written for the version the client says it reads in its
    ``Accept`` header (``text/x-flat; version=1.1``), so older clients get 1.0 text."""

    def __init__(self, app: ASGIApp, **encode_options: Any) -> None:
        self.app = app
        self.options = encode_options

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        accept = _header(list(scope.get("headers") or []), b"accept")
        accept_text = accept.decode("latin-1") if accept else None
        wanted = prefers_flat(accept_text)
        # Written for a version the client reads: clients before 1.14 get 1.0 text.
        options = {**self.options, "target": "1.0" if self.options.get("target") == "1.0" else flat_version(accept_text)}
        start: Message | None = None
        body: list[bytes] = []
        passthrough = True

        async def wrapped(message: Message) -> None:
            nonlocal start, passthrough
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                vary = _header(headers, b"vary")
                headers = _without(headers, b"vary") + [
                    (b"vary", add_vary(vary.decode("latin-1") if vary else None).encode("latin-1"))
                ]
                message = {**message, "headers": headers}
                ctype = _header(headers, b"content-type")
                passthrough = not (wanted and ctype is not None and _JSON.search(ctype.decode("latin-1")))
                if passthrough:
                    await send(message)
                else:
                    start = message
                return
            if message["type"] != "http.response.body" or passthrough:
                await send(message)
                return
            body.append(message.get("body", b""))
            if message.get("more_body", False):
                return
            assert start is not None
            raw = b"".join(body)
            try:
                payload = encode(json.loads(raw), **options).encode("utf-8")
                headers = _without(start["headers"], b"content-type", b"content-length")
                headers += [(b"content-type", CONTENT_TYPE), (b"content-length", str(len(payload)).encode())]
                start = {**start, "headers": headers}
            except (ValueError, TypeError, RecursionError):
                payload = raw  # not valid JSON after all: send it as it was
            await send(start)
            await send({"type": "http.response.body", "body": payload, "more_body": False})

        await self.app(scope, receive, wrapped)
