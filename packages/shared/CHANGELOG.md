# @flattype/shared

## 1.13.0

### Minor Changes

- Exact integers and built-in types. `encode` writes a `BigInt` as its digits and `decode(text, { bigint: true })` reads integers beyond 2^53 as exact BigInts. New `@flattype/core/types`: `replaceTypes` (Map, Set, bytes, errors), `reviveDates`, `parseJson` and `stringifyJson`. Models gain `"bigint"` and `"bytes"` field types and keep big integers exact when parsing Flat Notation. `flatFetch` keeps them exact when a model is given (or with `bigint: true`), and the CLI keeps them exact both ways.

## 1.12.0

### Minor Changes

- Warnings for lenient decoding (`onWarning`), with the line and column of every repair. A table header without its colon is read as a table. `fromModelOutput` throws `ModelOutputError` saying where broken JSON breaks instead of returning `{}`. `flattype decode --lenient` prints the warnings.

## 1.11.0

### Minor Changes

- `skipInvalidLines` for lenient decoding. `fromModelOutput` no longer hangs on a reply that starts with a lookalike tag, and drops prose lines in linear time. The `flattype` package for Python is out on PyPI.

## 1.10.0

### Minor Changes

- References for shared objects and cycles (`refs: true`), `replacer` and `reviver` like JSON, a `<script>` build for CDNs, and `flattype decode --refs`.

## 1.9.0

### Minor Changes

- Hardening: bounded lenient index gaps, linear-time streaming, `fromModelOutput` extraction, numeric coercion and `streamRows` batches. Docs site and playground.

## 1.8.0

### Minor Changes

- New package `@flattype/cli` (`flattype encode | decode | stats | gen`), `fromOpenAPI`, and `toSource({ ...models })` in `@flattype/models`.

## 1.7.0

### Minor Changes

- New package `@flattype/ai`: `toPrompt`, `outputInstructions`, `fromModelOutput`, `countTokens`, `toolResult` (MCP) and `claudeToolResult`.

## 1.6.0

### Minor Changes

- New package `@flattype/svelte`: `flatStore`, `flatStreamStore`, `modelStore` and `createFlat` (store contract, also usable from Solid via `from()`), plus `@flattype/svelte/solid` with `createFlatResource` and `createFlatStream`.

## 1.5.0

### Minor Changes

- New package `@flattype/angular`: `flatInterceptor`, `provideFlatType`, `flatResource`, `flatStream`, `FlatModelPipe`, `mapModel` / `mapModelList`.

## 1.4.1

## 1.4.0

### Minor Changes

- New package `@flattype/vue`: `createFlat`, `useFlat`, `useFlatSuspense`, `useFlatStream` and `useModel` for Vue 3.

## 1.3.0

### Minor Changes

- New package `@flattype/react`: `useFlat`, `useFlatSuspense`, `useFlatStream`, `useModel` and `FlatProvider`.

## 1.2.0

### Minor Changes

- New package `@flattype/http` (`flatFetch`, `createClient`, `flatAxios`, `flatExpress`, `flatFastify`, `flatHono`, `negotiate`, `streamRows`) and `createDecoder` in `@flattype/core` for incremental decoding.

## 1.1.0

### Minor Changes

- New package `@flattype/models`: `defineModel` with TypeScript inference, snake_case → camelCase key mapping, coercion, defaults, `parse` / `parseList` / `safeParse` / `serialize` / `encode`, plus `infer` and `toSource` to generate models from a sample response.

## 1.0.0

### Major Changes

- First release: Flat Notation `encode` / `decode`, `flatten` / `unflatten`, and `stats`.
