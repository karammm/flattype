# @flattype/shared

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
