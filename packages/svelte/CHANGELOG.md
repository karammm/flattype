# @flattype/svelte

## 1.12.0

### Patch Changes

- Updated dependencies
  - @flattype/core@1.12.0
  - @flattype/shared@1.12.0
  - @flattype/http@1.12.0

## 1.11.0

### Patch Changes

- Updated dependencies
  - @flattype/core@1.11.0
  - @flattype/shared@1.11.0
  - @flattype/http@1.11.0

## 1.10.0

### Patch Changes

- Updated dependencies
  - @flattype/core@1.10.0
  - @flattype/shared@1.10.0
  - @flattype/http@1.10.0

## 1.9.0

### Minor Changes

- Hardening: bounded lenient index gaps, linear-time streaming, `fromModelOutput` extraction, numeric coercion and `streamRows` batches. Docs site and playground.

### Patch Changes

- Updated dependencies
  - @flattype/http@1.9.0
  - @flattype/core@1.9.0
  - @flattype/shared@1.9.0

## 1.8.0

### Minor Changes

- New package `@flattype/cli` (`flattype encode | decode | stats | gen`), `fromOpenAPI`, and `toSource({ ...models })` in `@flattype/models`.

### Patch Changes

- Updated dependencies
  - @flattype/http@1.8.0
  - @flattype/core@1.8.0
  - @flattype/shared@1.8.0

## 1.7.0

### Minor Changes

- New package `@flattype/ai`: `toPrompt`, `outputInstructions`, `fromModelOutput`, `countTokens`, `toolResult` (MCP) and `claudeToolResult`.

### Patch Changes

- Updated dependencies
  - @flattype/http@1.7.0
  - @flattype/core@1.7.0
  - @flattype/shared@1.7.0

## 1.6.0

### Minor Changes

- New package `@flattype/svelte`: `flatStore`, `flatStreamStore`, `modelStore` and `createFlat` (store contract, also usable from Solid via `from()`), plus `@flattype/svelte/solid` with `createFlatResource` and `createFlatStream`.

### Patch Changes

- Updated dependencies
  - @flattype/http@1.6.0
  - @flattype/core@1.6.0
  - @flattype/shared@1.6.0
