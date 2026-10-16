# @flattype/ai

## 1.11.0

### Minor Changes

- `skipInvalidLines` for lenient decoding. `fromModelOutput` no longer hangs on a reply that starts with a lookalike tag, and drops prose lines in linear time. The `flattype` package for Python is out on PyPI.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.11.0
  - @flattype/shared@1.11.0

## 1.10.0

### Patch Changes

- Updated dependencies
  - @flattype/core@1.10.0
  - @flattype/shared@1.10.0

## 1.9.0

### Minor Changes

- Hardening: bounded lenient index gaps, linear-time streaming, `fromModelOutput` extraction, numeric coercion and `streamRows` batches. Docs site and playground.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.9.0
  - @flattype/shared@1.9.0

## 1.8.0

### Minor Changes

- New package `@flattype/cli` (`flattype encode | decode | stats | gen`), `fromOpenAPI`, and `toSource({ ...models })` in `@flattype/models`.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.8.0
  - @flattype/shared@1.8.0

## 1.7.0

### Minor Changes

- New package `@flattype/ai`: `toPrompt`, `outputInstructions`, `fromModelOutput`, `countTokens`, `toolResult` (MCP) and `claudeToolResult`.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.7.0
  - @flattype/shared@1.7.0
