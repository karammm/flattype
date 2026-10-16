# Changelog

All `@flattype/*` packages share one version number.

## 1.8.0

### New: `@flattype/cli`

- `flattype encode` / `flattype decode` convert JSON and Flat Notation from a file or stdin (`--delimiter`, `--indent`, `--no-tables`, `--compact`, `--lenient`, `-o`)
- `flattype stats` compares bytes and gzip bytes as JSON and as Flat Notation
- `flattype gen --sample response.json --name User` prints TypeScript models inferred from a real response (JSON or Flat Notation)
- `flattype gen --openapi openapi.yaml -o models.ts` writes one model per object schema of an OpenAPI 3.0/3.1 or Swagger 2 spec, in JSON or YAML. It handles `$ref`, `allOf`, `required`, `nullable` and `type: [..., "null"]`, `oneOf` with null, `date` / `date-time`, enums and inline objects. Recursive references become `"any"`, with a warning
- `fromOpenAPI(spec)` for use from code
- Clear errors with exit codes (1 for bad input, 2 for usage)

### `@flattype/models`

- `toSource({ User, Order })` prints several named models into one file and references shared ones by name

## 1.7.0

### New: `@flattype/ai`

- `toPrompt(data, { name, legend })` formats data as Flat Notation inside `<data format="flat-notation">` tags, with a one-line legend. The legend is a `#` comment, so the block stays valid Flat Notation; put it in the system prompt once with `legend: false`
- `outputInstructions(example)` asks a model to answer in Flat Notation and shows the expected shape
- `fromModelOutput(reply, { model, list })` reads data out of what models actually send back: `<data>` tags, code fences, prose before or after, small slips, or plain JSON. With a model it maps and validates
- `countTokens(client, data)` compares real Claude tokens for JSON and Flat Notation via the Messages API token-counting endpoint (pass `new Anthropic()`; the SDK isn't a dependency)
- `toolResult(data)` returns an MCP `CallToolResult` with Flat Notation text (optionally `structuredContent`), and `claudeToolResult(id, data)` returns a Claude API `tool_result` block
- No runtime dependencies besides `@flattype/core`. 1.3 KB min+gz

### Examples

- `examples/ai-claude`: `tokens.mjs` (real token counts), `ask.mjs` (Claude Opus 5.5 answers about Flat Notation data in Flat Notation, decoded into typed models) and `mcp-server.mjs`, an MCP server whose tool returns Flat Notation. CI calls it over stdio with a real MCP client

## 1.6.0

### New: `@flattype/svelte` (Svelte and Solid)

- `flatStore(url, { model, list })` is a store of `{ data, error, loading }` plus `refetch()`. It follows the store contract, so Svelte 3, 4 and 5 read it with `$store`. `url` can be a string or a store. It fetches on the first subscriber, aborts on the last unsubscribe, and aborts the old request when the URL changes
- `flatStreamStore(url, { model, table })`: rows of a big list while it is still downloading
- `modelStore(source, Model)` maps another store's value
- `createFlat({ baseURL, headers, fetch })` shares options between stores. `headers` can be a function, for fresh tokens
- `@flattype/svelte/solid`: `createFlatResource(() => url, { model })`, a real Solid resource (works with `<Suspense>` and `<ErrorBoundary>`, aborts on change), and `createFlatStream`. The stores also work in Solid through `from(store)`
- No framework dependency in the main entry (`solid-js` is an optional peer for `/solid`). 1.1 KB + 0.9 KB min+gz

### Examples

- `examples/svelte-app` (Svelte 5) and `examples/solid-app` (Solid with `<Suspense>`), each with a real Express API and Playwright tests in Chromium, Firefox and WebKit

## 1.5.0

### New: `@flattype/angular`

- `flatInterceptor`, a functional HttpClient interceptor: it asks for Flat Notation (JSON stays the fallback) and decodes it, so `http.get<T>()` works the same with either format. Error bodies are decoded too. `FLAT_TYPE_SKIP` opts a request out
- `flatResource(() => url, { model, list })` returns signals for `value`, `error` and `isLoading` plus `reload()`. It runs on HttpClient, so your interceptors apply. A URL that reads signals refetches when they change and cancels the old request
- `flatStream(() => url, { model, table })` renders rows of a big list while it is still downloading
- The `flatModel` pipe (`{{ raw | flatModel: User }}`) and the RxJS operators `mapModel` / `mapModelList`
- `provideFlatType({ baseURL, headers, fetch })`
- Angular 19+ (built with partial compilation; the example runs Angular 22, zoneless), 1.8 KB min+gz

### Examples and CI

- `examples/angular-app`: an Angular 22 production build served together with a real Express API, tested in Chromium, Firefox and WebKit

## 1.4.1

### Fixes

- `@flattype/vue`: `useFlatSuspense` returned before its data was set during server-side rendering with Vue 3.5, because Vue stops watchers after setup and that aborted the first request. The first request now runs outside the watcher. Server-rendering tests were added

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
