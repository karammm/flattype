"""Calls app.py twice, as curl would, and prints both answers as JSON (used by scripts/video/record.mjs)."""

import asyncio
import json

import httpx

from app import app


async def main() -> None:
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://localhost:3000") as client:
        plain = await client.get("/users")
        flat = await client.get("/users", headers={"accept": "text/x-flat"})
    print(json.dumps({"plain": plain.text, "flat": flat.text, "contentType": flat.headers["content-type"]}))


asyncio.run(main())
