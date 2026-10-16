# FlatType.js Release Roadmap

Each release is built, tested, tagged, and published on its own before work on the next one starts.

## Versioning

- **Lockstep versions:** every `@flattype/*` package shares one version number.
- **Minor `1.x.0`:** new packages or features, no breaking changes.
- **Patch `1.x.y`:** bug fixes, any time.
- **Breaking changes** wait for `2.0.0`. Nothing in this roadmap plans one.
- **The Flat Notation format is stable since 1.0.** Text written by 1.0 decodes the same way in every 1.x. The only syntax added since (references, 1.10) is opt-in on both ends and was an error before.

## Release checklist (every version)

1. Implement the scope, with unit tests (and browser tests for framework packages)
2. Add an example, update the READMEs, and re-render the intro video (`pnpm video`) if what it shows changed
3. Add a changeset
4. CI green on Node 18/20/22/24, under the size budget (`pnpm check:size`)
5. Pack and install the tarballs in a clean project (ESM, CJS, types)
6. Run `pnpm changeset version` and push to `main`. The release workflow publishes to npm, tags `vX.Y.Z` and creates the GitHub release
7. Install the published version from npm and smoke-test it

---

## v1.0.0: Core engine ✅

Packages: `@flattype/core`, `@flattype/shared`

- `encode` / `decode` for Flat Notation: `key: value` lines, dot paths for nested objects, inline primitive arrays, and tables for arrays of same-shaped objects (nested fields flattened into the header)
- `flatten` / `unflatten` for in-memory dot-path records
- Options: `delimiter` (`,` `|` tab), `indent`, `tabular`, and `strict` decoding with line/column errors
- Zero dependencies, `__proto__`-safe decoding
- Tests: property-based round trip (fast-check) across every option, escaping edge cases, malformed input
- Benchmarks: bytes, gzip bytes and parse time against JSON and TOON (`pnpm compare`)

## v1.1.0: Automatic model mapping ✅

New package: `@flattype/models`

- `defineModel({ id: "number", createdAt: "date", user: UserModel })` with full TypeScript inference
- Key mapping (`snake_case` → `camelCase`, `rename`), coercion (ISO dates, numeric strings), defaults, optional/nullable fields
- `infer(sample)` builds a model from a real API response
- Works on decoded Flat Notation and on plain JSON
- `toSource(model, name)` prints TypeScript for a model, and `examples/node-models` shows the whole flow

## v1.2.0: HTTP integration ✅

New package: `@flattype/http`

- `flatFetch(url, { model })` and `createClient()` with `Accept: text/x-flat, application/json` negotiation and JSON fallback
- `flatAxios()` interceptor
- `flatExpress()`, `flatFastify` and `flatHono()`, plus `negotiate()` for any fetch-API server, serving `text/x-flat` only when the client asks for it
- `streamRows()` for large tables (rows emitted as they arrive), built on the new `createDecoder()` in core
- Tested against real Express, Fastify, Hono and axios, `examples/node-server`
- Releases became fully automatic (version bump on `main` → npm + GitHub release)

## v1.3.0: React ✅

New package: `@flattype/react`

- `useFlat(url, { model })`, `useFlatSuspense`, `useFlatStream` (rows render while downloading) and `useModel(data, Model)`
- `FlatProvider` for `baseURL`, headers, a custom `fetch` and the Suspense cache
- React Testing Library tests, `examples/react-app` with Playwright tests in Chromium, Firefox and WebKit

## v1.4.0: Vue ✅

New package: `@flattype/vue`

- `useFlat`, `useFlatSuspense`, `useFlatStream` and `useModel` composables with reactive URLs, and a `createFlat()` plugin
- Vue Test Utils tests, `examples/vue-app` with Playwright tests in Chromium, Firefox and WebKit

## v1.5.0: Angular ✅

New package: `@flattype/angular`

- `provideFlatType()`, the `flatInterceptor` HttpClient interceptor and the `flatModel` pipe (ng-packagr, Angular 19+)
- The signal-based `flatResource` and `flatStream`, and the RxJS operators `mapModel` / `mapModelList`
- `examples/angular-app` (Angular 22, zoneless) with Playwright tests in Chromium, Firefox and WebKit

## v1.6.0: Svelte and Solid ✅

New package: `@flattype/svelte`

- `flatStore`, `flatStreamStore`, `modelStore` and `createFlat`, built on the store contract (Svelte `$store`, Solid `from()`)
- `@flattype/svelte/solid`: `createFlatResource` and `createFlatStream`
- `examples/svelte-app` (Svelte 5) and `examples/solid-app`, each with Playwright tests in Chromium, Firefox and WebKit

## v1.7.0: Claude and LLMs ✅

New package: `@flattype/ai`

- `toPrompt(data)`: Flat Notation plus a one-line legend so the model reads it reliably. `outputInstructions(example)` asks for answers in Flat Notation
- `fromModelOutput(text)`: lenient decoding of model replies (tags, fences, prose, JSON fallback) into typed models
- `countTokens()`: a token-savings report through the Anthropic token-counting API
- `toolResult()` for MCP, `claudeToolResult()` for the Claude API, `examples/ai-claude` (tested over stdio with a real MCP client)

## v1.8.0: CLI and code generation ✅

New package: `@flattype/cli`

- `flattype encode` / `flattype decode` / `flattype stats` for files and stdin
- `flattype gen --openapi spec.yaml` (OpenAPI 3.0/3.1, Swagger 2, JSON or YAML) and `flattype gen --sample response.json` generate models
- `toSource({ ...models })` in `@flattype/models` for multi-model files

## v1.9.0: Docs, playground, hardening ✅

- VitePress docs and a GitHub Pages playground with a live savings meter
- Fuzzing in CI and published benchmarks


## v1.10.0: References, JSON hooks, CDN build ✅
Ideas from comparing with [flatted](https://github.com/WebReflection/flatted).
- `encode(x, { refs: true })` writes a shared object once and `path = first.path` after that, so shared objects and cycles survive. `decode(text, { refs: true })` rebuilds the same object graph. Off by default on both ends
- `replacer` for `encode` and `reviver` for `decode`, matching `JSON.stringify` / `JSON.parse`
- A `<script>` build (`FlatType` global) for jsDelivr and unpkg
- The README's core size is checked against the real bundle by `pnpm check:size`
- `flattype decode --refs`

## v1.11.0: Python ✅
- `flattype` on PyPI: `encode`, `decode` (strict and lenient), the same options as `@flattype/core`
- Shared fixtures run against both implementations in CI, so the two can't disagree on the format
- ASGI middleware for FastAPI / Starlette that answers in Flat Notation when the client asks, plus a response class
- The LLM helpers (`to_prompt`, `from_model_output`, `count_tokens`) in `flattype.ai`
---

Have an idea or a use case that isn't covered? [Open an issue](https://github.com/karammm/flattype/issues).
