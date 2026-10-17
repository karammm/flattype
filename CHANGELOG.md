# Changelog

All `@flattype/*` packages share one version number.

## 1.14.0

Flat Notation 1.1: lists whose objects don't all have the same keys are now compact. Before, one missing key turned a table into indexed paths (`users[0].id`, `users[1].id`…), which came out larger than JSON and twice its size after gzip.

### Optional table fields

- A field that some objects lack is marked `?` in the header, and its cell is empty where the key is missing: `users[2]{id,name,phone?}:`. `null` and `""` are still values
- On 1,000 contacts where some lack a phone or an address: 59.7 KB instead of 120.3 KB, and 10.7 KB instead of 22.1 KB gzipped. JSON is 101.9 KB (11.3 KB gzipped)

### `[+]` items

- A list that still can't be a table is written one item at a time: `events[+].type: push` starts the next item, and the lines after it that start with `.` continue it (`.repo: org/app`). The lines repeat instead of counting up, which is what gzip needs
- On a 500-event activity feed: 12.1 KB gzipped instead of 26.5 KB, slightly smaller than JSON's 12.4 KB. On the mixed-shape benchmark: 3,179 B instead of 3,599 B, and 367 B instead of 643 B gzipped

### Older readers keep working

- Every document written by an earlier version decodes exactly as before. But a decoder older than 1.14 can't read the new syntax, so `encode(value, { target: "1.0" })` (Python: `target="1.0"`, CLI: `--target 1.0`) writes exactly what 1.13 wrote
- `@flattype/http` and the Python `FlatMiddleware` choose for you: clients from 1.14 send `Accept: text/x-flat; version=1.1`, and only they get 1.1 text. Older clients get 1.0. New helpers: `flatVersion(accept)` and `responseOptions(accept, options)`
- Python's `FlatResponse`, which can't see the client, writes 1.0 unless subclassed with `target = "1.1"`

### Specification and tooling

- [Flat Notation 1.1](https://github.com/karammm/flattype/blob/main/spec/SPEC.md): the grammar, items, optional fields and the encoder rules for them, and an amended versioning rule (a minor version may change the canonical form, and every 1.x encoder can still write 1.0)
- The conformance suite is regenerated for 1.1, with 1,032 more encode cases (including `target: 1.0`). The 1.0 suite is frozen in `conformance/1.0/`, and CI checks that 1.1 reads every 1.0 document the same way and that `target: "1.0"` reproduces every 1.0 text byte for byte
- New linear-time checks: a `.` line costs only its own length, even after an item with a 100,000-segment path
- `toPrompt`'s legend and `outputInstructions` describe the new syntax; the playground's "Mixed shapes" sample shows it

The core grew by 1 KB to 6.2 KB min+gz (budget raised to 6.5 KB).

## 1.13.0

Ideas from comparing with [MessagePack](https://msgpack.org/): exact 64-bit integers and ready-made extension types, without changing the format.

### Exact integers

- `encode` writes a `BigInt` as its digits (it used to throw, like `JSON.stringify`). `decode(text, { bigint: true })` reads every integer beyond 2⁵³ as an exact `BigInt` instead of rounding it; smaller integers stay numbers. Works in tables, inline arrays, the streaming decoder and lenient mode. Python ints were already exact, and 100 new shared conformance cases check that both languages write and read the same digits
- `@flattype/models`: a `"bigint"` field type. Parsing Flat Notation keeps big integers exact; a number that was already rounded (from `JSON.parse`) is refused with *beyond 2^53 and already rounded*, not silently accepted. `"number"` fields convert BigInts, `"string"` fields keep their digits, and `infer` picks `"bigint"` for big integers
- `flatFetch` and `createClient` keep big integers exact when a `model` is given (or with `bigint: true`), in Flat Notation and, on engines with JSON.parse source text access (Node 21+, Chrome 114+), in JSON. Request bodies write BigInts as digits
- `flattype decode` and `flattype encode` keep big integers exact both ways (JSON input needs Node 21+)

### Built-in types: `@flattype/core/types`

- `replaceTypes`: a replacer for `encode` or `JSON.stringify` that writes `Map`, `Set`, `Uint8Array` / `Buffer` / `ArrayBuffer` (base64), other typed arrays and `Error`s as plain data
- `reviveDates`: a reviver that turns date-time strings with a zone (including Python's microseconds) into `Date`s
- `parseJson` / `stringifyJson`: JSON that keeps big integers exact
- `@flattype/models`: a `"bytes"` field type (base64 or URL-safe base64 → `Uint8Array`, and back). The CLI maps OpenAPI `format: byte` to it
- Python: `flattype.types.default` for `encode(x, default=...)` (`datetime` written exactly as JavaScript writes dates, `bytes`, `set`, `Decimal`, `UUID`, enums, dataclasses, Pydantic models) and `flattype.types.revive_dates`

### Benchmarks

- MessagePack in the [Edge demo benchmark](https://github.com/karammm/flattype/blob/main/benchmarks/edge-json-dummy-data.md): 5% smaller than minified JSON before compression, 11% larger after gzip. Flat Notation is 14% and 2% smaller

The core grew by 28 bytes (still 5.2 KB min+gz): the helpers are a separate entry point, `@flattype/core/types`.

## 1.12.0

### Warnings: where the data is wrong

- `decode(text, { strict: false, onWarning })` reports every repair lenient decoding makes, as `{ message, line, column }`: *line 77, column 1: Expected 5 values, got 4: the missing values are null*. The same in Python: `decode(text, strict=False, on_warning=...)`, with identical messages (checked by 641 shared test cases)
- With `skipInvalidLines`, a skipped line reports only that it was skipped and why, not the problems inside it
- `flattype decode --lenient` prints the warnings to stderr (`warning: file.flat:77:1: …`), the first 50 and then a count
- `FlatDecodeError` has a `reason`: the message without its position

### Repairs

- Lenient decoding reads a table header that only lacks its colon (`users[2]{id,name}`) as a table, with a warning. It used to lose every row
- `fromModelOutput` (and Python's `from_model_output`) throws `ModelOutputError` for JSON that doesn't parse, with `line`, `column` and the text around the problem: *The data is JSON, but it is broken at line 1, column 22261: …"language" ⟶ "Galician"…*. It used to return `{}` without an error. `onWarning` receives the Flat Notation repairs

The core is 5.2 KB min+gz (was 4.8 KB); its budget is now 5.5 KB.

## 1.11.0

### New: `flattype` for Python ([PyPI](https://pypi.org/project/flattype/))

- `encode` / `decode` (strict, lenient, `refs`, streaming `Decoder` with `on_row`), `flatten` / `unflatten`, `stats`, with the same options as `@flattype/core`. Python 3.9+, no dependencies
- `flattype.asgi.FlatMiddleware`: FastAPI, Starlette and any ASGI app answer in Flat Notation when the client asks, with the same negotiation rules as `@flattype/http`. `flattype.starlette.FlatResponse` for routes that always do
- `flattype.ai`: `to_prompt`, `output_instructions`, `from_model_output` (optionally validated with a Pydantic model), `count_tokens`, `tool_result`, `claude_tool_result`
- Writes exactly what JavaScript writes, including number formatting (`1e+21`, `1e-7`). `conformance/` holds 990 encode cases, 3,215 decode cases (errors compared by message, line and column), 150 object graphs and 425 prompt and reply cases, all generated from the JavaScript packages. CI fails if they're stale or if Python disagrees
- [`examples/python-fastapi`](https://github.com/karammm/flattype/tree/main/examples/python-fastapi), and a Python step in the intro video

### Fixes (`@flattype/ai`)

- `fromModelOutput` no longer loops forever on a reply that starts with a lookalike tag (`<database>…</data>`)
- `fromModelOutput` drops prose lines in one pass: linear instead of quadratic in the number of lines (8,000 lines: 25 ms, was 850 ms)

### `@flattype/core`

- `decode(text, { strict: false, skipInvalidLines: true })` drops lines that can't be read, as if they weren't there. A line that fails part way leaves nothing behind, and a table whose path can't be written is dropped

## 1.10.0

### Shared objects and cycles (`@flattype/core`)

- `encode(value, { refs: true })` writes an object that appears more than once in full the first time and as `path = first.path` after that (`~` is the root). Cycles no longer have to throw
- `decode(text, { refs: true })` rebuilds the same object graph: `back.members[0] === back.lead`
- Off by default on both ends. Without `refs`, encoding works as before (shared objects repeated, cycles throw) and the decoder rejects reference lines, so nothing that reads untrusted text gets a cyclic result. See the [security page](https://karammm.github.io/flattype/docs/guide/security)

### JSON hooks (`@flattype/core`)

- `encode(value, { replacer })` takes a function or a key list, exactly like `JSON.stringify`
- `decode(text, { reviver })` works like `JSON.parse`'s reviver, with the same call order (checked against `JSON.parse` on random values). The walk is iterative, so deep documents can't overflow the stack

### Browser build

- `@flattype/core` ships `dist/flattype.min.js`, a `<script>` build with a `FlatType` global, and points `unpkg` and `jsdelivr` at it: `<script src="https://cdn.jsdelivr.net/npm/@flattype/core@1"></script>`

### Other

- `@flattype/cli`: `flattype decode --refs`
- The cycle check in `encode` and `flatten` uses a `Set` instead of scanning the current path
- `pnpm check:size` fails if the README or docs state a different core size than the real bundle, and `--write` updates them
- The core grows from 3.7 to 4.7 KB min+gz for these features; its budget is now 5 KB, like the other packages

## 1.9.0

### Docs and playground

- Documentation site at [karammm.github.io/flattype/docs](https://karammm.github.io/flattype/docs/) (VitePress), with a full **format specification**, a **security** page and **benchmarks** measured on every build. The guide pages are generated from the README, so the two can't drift apart
- [Playground](https://karammm.github.io/flattype/): paste JSON or Flat Notation and see the conversion, byte and gzip savings and the generated TypeScript model, all in the browser
- Both are checked with axe-core (WCAG 2.2 AA, light and dark mode), for broken links, and on a phone layout

### Hardening

A review of every regular expression and loop that sees untrusted input:

- `@flattype/core`: lenient decoding fills at most 1,000 skipped indexes with `null` (`a[999999999]: 1` could allocate a billion entries). `createDecoder()` stays linear for one long line streamed in small chunks
- `@flattype/ai`: `fromModelOutput` extraction is linear on hostile text (many `<data` or fence openers without a closer)
- `@flattype/models`: the numeric-string check no longer backtracks quadratically on long digit runs
- `@flattype/http`: `streamRows` hands out large batches without quadratic `Array#shift`
- New CI job: 50,000 fuzz runs per encode option, decoder fuzzing (only `FlatDecodeError`, no prototype pollution, streamed equals whole), and linear-time checks on hostile inputs
- `SECURITY.md` with private vulnerability reporting

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
