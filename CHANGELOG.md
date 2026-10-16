# Changelog

All `@flattype/*` packages share one version number.

## 1.0.0

### New: `@flattype/core` and `@flattype/shared`

- `encode` / `decode` for Flat Notation, with tables for arrays of same-shaped objects
- `flatten` / `unflatten` for dot-path records
- `stats` compares the size of a value as JSON and as Flat Notation
- `FlatDecodeError` reports the line and column of malformed input; `strict: false` recovers instead
