# @flattype/cli

## 1.13.0

### Minor Changes

- Exact integers and built-in types. `encode` writes a `BigInt` as its digits and `decode(text, { bigint: true })` reads integers beyond 2^53 as exact BigInts. New `@flattype/core/types`: `replaceTypes` (Map, Set, bytes, errors), `reviveDates`, `parseJson` and `stringifyJson`. Models gain `"bigint"` and `"bytes"` field types and keep big integers exact when parsing Flat Notation. `flatFetch` keeps them exact when a model is given (or with `bigint: true`), and the CLI keeps them exact both ways.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.13.0
  - @flattype/shared@1.13.0
  - @flattype/models@1.13.0

## 1.12.0

### Minor Changes

- Warnings for lenient decoding (`onWarning`), with the line and column of every repair. A table header without its colon is read as a table. `fromModelOutput` throws `ModelOutputError` saying where broken JSON breaks instead of returning `{}`. `flattype decode --lenient` prints the warnings.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.12.0
  - @flattype/shared@1.12.0
  - @flattype/models@1.12.0

## 1.11.0

### Patch Changes

- Updated dependencies
  - @flattype/core@1.11.0
  - @flattype/shared@1.11.0
  - @flattype/models@1.11.0

## 1.10.0

### Minor Changes

- References for shared objects and cycles (`refs: true`), `replacer` and `reviver` like JSON, a `<script>` build for CDNs, and `flattype decode --refs`.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.10.0
  - @flattype/shared@1.10.0
  - @flattype/models@1.10.0

## 1.9.0

### Minor Changes

- Hardening: bounded lenient index gaps, linear-time streaming, `fromModelOutput` extraction, numeric coercion and `streamRows` batches. Docs site and playground.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.9.0
  - @flattype/models@1.9.0
  - @flattype/shared@1.9.0

## 1.8.0

### Minor Changes

- New package `@flattype/cli` (`flattype encode | decode | stats | gen`), `fromOpenAPI`, and `toSource({ ...models })` in `@flattype/models`.

### Patch Changes

- Updated dependencies
  - @flattype/core@1.8.0
  - @flattype/models@1.8.0
  - @flattype/shared@1.8.0
