# @flattype/vue

## 1.4.1

### Patch Changes

- `useFlatSuspense` now works during server-side rendering with Vue 3.5: the first request is no longer aborted when Vue stops watchers after setup.
  - @flattype/core@1.4.1
  - @flattype/http@1.4.1
  - @flattype/shared@1.4.1

## 1.4.0

### Minor Changes

- New package `@flattype/vue`: `createFlat`, `useFlat`, `useFlatSuspense`, `useFlatStream` and `useModel` for Vue 3.

### Patch Changes

- Updated dependencies
  - @flattype/http@1.4.0
  - @flattype/core@1.4.0
  - @flattype/shared@1.4.0
