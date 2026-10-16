# Changelog

All `@flattype/*` packages share one version number.

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
