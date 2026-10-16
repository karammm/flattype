# FlatType.js Release Roadmap

Each release is built, tested, tagged, and published on its own before work on the next one starts.

## Versioning

- **Lockstep versions:** every `@flattype/*` package shares one version number.
- **Minor `1.x.0`:** new packages or features, no breaking changes.
- **Patch `1.x.y`:** bug fixes, any time.
- **Breaking changes** wait for `2.0.0`. Nothing in this roadmap plans one.
- **The Flat Notation format is frozen at 1.0.** Later versions only add tooling around it, so text written by 1.0 still decodes in every 1.x.

## Release checklist (every version)

1. Implement the scope, with unit tests (and browser tests for framework packages)
2. Add an example, update the READMEs, and re-render the intro video (`pnpm video`) if what it shows changed
3. Add a changeset
4. CI green on Node 18/20/22/24, under the size budget (`pnpm check:size`)
5. Pack and install the tarballs in a clean project (ESM, CJS, types)
6. Tag `vX.Y.Z`, publish to npm, create the GitHub release
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

## v1.1.0: Automatic model mapping

New package: `@flattype/models`

- `defineModel({ id: "number", createdAt: "date", user: UserModel })` with full TypeScript inference
- Key mapping (`snake_case` → `camelCase`, `rename`), coercion (ISO dates, numeric strings), defaults, optional/nullable fields
- `infer(sample)` builds a model from a real API response
- Works on decoded Flat Notation and on plain JSON
- `toSource(model, name)` prints TypeScript for a model, and `examples/node-models` shows the whole flow

## v1.2.0: HTTP integration

New package: `@flattype/http`

- `flatFetch(url, { model })` with `Accept: text/x-flat, application/json` negotiation and JSON fallback
- Axios interceptor
- Express / Fastify / Hono middleware that serves `text/x-flat` when the client asks for it
- Streaming decode for large tables (rows emitted as they arrive)

## v1.3.0: React

New package: `@flattype/react`

- `useFlat(url, Model)` and `useModel(data, Model)`, with Suspense support
- React Testing Library tests, `examples/react-app`

## v1.4.0: Vue

New package: `@flattype/vue`

- `useFlat` composable and a plugin, `examples/vue-app`

## v1.5.0: Angular

New package: `@flattype/angular`

- `provideFlatType()`, an `HttpInterceptor`, and a `flatModel` pipe (ng-packagr), `examples/angular-app`

## v1.6.0: Svelte and Solid

New package: `@flattype/svelte`

- Svelte stores and a Solid resource helper

## v1.7.0: Claude and LLMs

New package: `@flattype/ai`

- `toPrompt(data)`: Flat Notation plus a one-line legend so the model reads it reliably
- `fromModelOutput(text)`: lenient decoding of model replies
- Token-savings report through the Anthropic token-counting API
- MCP tool-result formatter, `examples/ai-claude`

## v1.8.0: CLI and code generation

New package: `@flattype/cli`

- `flattype encode` / `flattype decode` for files and stdin
- `flattype gen --openapi spec.yaml` and `flattype gen --sample response.json` generate models

## v1.9.0: Docs, playground, hardening

- VitePress docs and a GitHub Pages playground with a live savings meter
- Fuzzing in CI and published benchmarks

---

Have an idea or a use case that isn't covered? [Open an issue](https://github.com/karammm/flattype/issues).
