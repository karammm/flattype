# FastAPI example

`app.py` is a normal FastAPI app with one extra line, `app.add_middleware(FlatMiddleware)`. Clients that send
`Accept: text/x-flat` get Flat Notation; everyone else gets the same JSON as before.

```bash
uv run --with fastapi --with uvicorn --with ../../python uvicorn app:app --port 3000

curl localhost:3000/users
# {"users":[{"id":1,"name":"Alice Martin","role":"admin"},{"id":2,"name":"Bob Singh","role":"editor"}]}

curl -H "Accept: text/x-flat" localhost:3000/users
# users[2]{id,name,role}:
#   1, Alice Martin, admin
#   2, Bob Singh, editor
```

A JavaScript client reads it with `flatFetch` from [`@flattype/http`](../../packages/http), which sends that header.
