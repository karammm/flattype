"""A FastAPI app that answers in Flat Notation when the client asks, and in JSON otherwise.

    uv run --with fastapi --with uvicorn --with ../../python uvicorn app:app --port 3000
    curl -H "Accept: text/x-flat" localhost:3000/users
"""

from fastapi import FastAPI

from flattype.asgi import FlatMiddleware

app = FastAPI()
app.add_middleware(FlatMiddleware)

USERS = [
    {"id": 1, "name": "Alice Martin", "role": "admin"},
    {"id": 2, "name": "Bob Singh", "role": "editor"},
]


@app.get("/users")
def users() -> dict:
    return {"users": USERS}
