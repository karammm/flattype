from __future__ import annotations

import json
from typing import Any

import pytest

from flattype.asgi import FlatMiddleware
from flattype.negotiate import ACCEPT, add_vary, prefers_flat


def test_negotiation_rules() -> None:
    assert prefers_flat(ACCEPT)
    assert prefers_flat("text/x-flat")
    assert not prefers_flat("*/*")
    assert not prefers_flat(None)
    assert not prefers_flat("application/json, text/x-flat;q=0.5")
    assert not prefers_flat("text/x-flat;q=0")
    assert add_vary(None) == "Accept" and add_vary("Origin") == "Origin, Accept" and add_vary("accept") == "accept"


def json_app(payload: Any, content_type: bytes = b"application/json", chunks: int = 1):
    body = json.dumps(payload).encode()

    async def app(scope: Any, receive: Any, send: Any) -> None:
        await send(
            {
                "type": "http.response.start",
                "status": 200,
                "headers": [(b"content-type", content_type), (b"content-length", str(len(body)).encode())],
            }
        )
        step = max(1, len(body) // chunks)
        parts = [body[i : i + step] for i in range(0, len(body), step)]
        for i, part in enumerate(parts):
            await send({"type": "http.response.body", "body": part, "more_body": i < len(parts) - 1})

    return app


async def call(app: Any, accept: str | None) -> tuple[dict[bytes, bytes], bytes]:
    sent: list[dict[str, Any]] = []
    headers = [(b"accept", accept.encode())] if accept else []

    async def receive() -> dict[str, Any]:
        return {"type": "http.request"}

    async def send(message: dict[str, Any]) -> None:
        sent.append(message)

    await app({"type": "http", "headers": headers}, receive, send)
    return dict(sent[0]["headers"]), b"".join(m.get("body", b"") for m in sent[1:])


USERS = {"users": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}]}


@pytest.mark.anyio
@pytest.mark.parametrize("chunks", [1, 5])
async def test_answers_in_flat_notation_when_asked(chunks: int) -> None:
    headers, body = await call(FlatMiddleware(json_app(USERS, chunks=chunks)), ACCEPT)
    assert body == b"users[2]{id,name}:\n  1, Alice\n  2, Bob"
    assert headers[b"content-type"] == b"text/x-flat; charset=utf-8"
    assert headers[b"content-length"] == str(len(body)).encode()
    assert headers[b"vary"] == b"Accept"


@pytest.mark.anyio
async def test_leaves_other_clients_and_responses_alone() -> None:
    headers, body = await call(FlatMiddleware(json_app(USERS)), "*/*")
    assert json.loads(body) == USERS and headers[b"vary"] == b"Accept"
    headers, body = await call(FlatMiddleware(json_app(USERS, b"text/html")), ACCEPT)
    assert json.loads(body) == USERS
    headers, body = await call(FlatMiddleware(json_app(USERS, b"application/problem+json")), ACCEPT)
    assert body.startswith(b"users[2]")


@pytest.mark.anyio
async def test_fastapi() -> None:
    fastapi = pytest.importorskip("fastapi")
    httpx = pytest.importorskip("httpx")
    from flattype import decode
    from flattype.starlette import FlatResponse

    app = fastapi.FastAPI()
    app.add_middleware(FlatMiddleware)

    @app.get("/users")
    def users() -> Any:
        return USERS

    @app.get("/always", response_class=FlatResponse)
    def always() -> Any:
        return {"name": "John"}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        flat = await client.get("/users", headers={"accept": ACCEPT})
        assert flat.headers["content-type"] == "text/x-flat; charset=utf-8"
        assert decode(flat.text) == USERS
        plain = await client.get("/users")
        assert plain.json() == USERS
        always = await client.get("/always")
        assert always.text == "name: John" and always.headers["content-type"].startswith("text/x-flat")
