# Changelog

All `@flattype/*` packages share one version number.

## 1.4.0

### New: `@flattype/vue`

- `useFlat(url, { model, list })` returns `data`, `error` and `loading` refs plus `refetch`. The URL can be a ref or a getter: a change aborts the old request, and the old data stays while the next one loads
- `useFlatSuspense(url, { model })` for `async setup()` inside `<Suspense>`, so `data` is always set. A failed first request throws to `onErrorCaptured`
- `useFlatStream(url, { model, table })` renders rows of a big list while it is still downloading
- `useModel(source, Model)` is a computed ref for data you already have
- `createFlat({ baseURL, headers, fetch })` plugin. `headers` can be a function, so tokens stay current
- Vue 3.3+, 1.1 KB min+gz on top of `@flattype/http`

### Examples and CI

- `examples/vue-app`: Vite + Vue single-file components with a real Express API, tested in Chromium, Firefox and WebKit. CI now runs the browser tests of every example

## 1.3.0

### New: `@flattype/react`

- `useFlat(url, { model, list })`: `{ data, error, loading, refetch }`, typed from the model. Changing the URL aborts the old request, and the previous data stays visible while the next request loads
- `useFlatSuspense(url, { model })`: suspends until the data is ready, sends errors to the nearest error boundary, and caches by URL (one request even for many components and StrictMode)
- `useFlatStream(url, { model, table })`: renders rows of a big list while it is still downloading, one render per network chunk
- `useModel(data, Model)`: memoized mapping for data you already have
- `FlatProvider` for `baseURL`, `headers`, a custom `fetch` and the Suspense cache (`FlatCache`, with `invalidate` and `set`)
- React 18 and 19, 1.4 KB min+gz on top of `@flattype/http`

### Examples and CI

- `examples/react-app`: Vite + React with a real Express API, tested in Chromium, Firefox and WebKit with Playwright on every push

## 1.2.0

### New: `@flattype/http`

- `flatFetch(url, { model, list })` asks for Flat Notation with JSON as the fallback, decodes either, maps to a model, and throws `HttpError` (with the decoded body) on non-2xx responses
- `createClient({ baseURL, headers })` with `get` / `post` / `put` / `patch` / `delete`, query strings and JSON request bodies
- `flatAxios(instance)` does the same for axios
- Server side: `flatExpress()`, `flatFastify`, `flatHono()` and `negotiate(request, response)` for any fetch-API server. JSON responses are re-encoded only when the client asks (`Accept: text/x-flat`), and `Vary: Accept` is always set
- `streamRows(urlOrResponse)` yields table rows while a large response is still downloading

### `@flattype/core`

- `createDecoder({ onRow, keepRows })` decodes chunk by chunk and reports each table row as soon as its line arrives. `decode` now uses it

### Releases

- Publishing is automatic: a version bump pushed to `main` builds, tests, publishes to npm with provenance, tags and creates the GitHub release

## 1.1.0

### New: `@flattype/models`

- `defineModel` with full TypeScript inference (`Infer<typeof Model>`)
- Automatic key mapping (`created_at` → `createdAt`), coercion (`"42"` → `42`, ISO strings → `Date`), defaults, optional and nullable fields (`"string?"`)
- `parse`, `parseList`, `safeParse`, `serialize` and `encode`; input can be JSON or Flat Notation
- `ModelError` lists every problem with its path
- `infer(sample)` builds a model from a real response and `toSource(model, name)` prints TypeScript for it

### Docs

- New README with a 42-second intro video (`pnpm video` re-renders it from real output)

## 1.0.0

### New: `@flattype/core` and `@flattype/shared`

- `encode` / `decode` for Flat Notation, with tables for arrays of same-shaped objects
- `flatten` / `unflatten` for dot-path records
- `stats` compares the size of a value as JSON and as Flat Notation
- `FlatDecodeError` reports the line and column of malformed input; `strict: false` recovers instead
