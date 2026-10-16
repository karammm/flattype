# FlatType.js

Flatten API JSON into **Flat Notation**, a compact `key: value` text format that is smaller than JSON, easy for people to read, and cheap for Claude and other LLMs to take in. Typed model mapping and framework packages for React, Vue, Angular and Svelte are on the [roadmap](ROADMAP.md).

```ts
import { encode, decode } from "@flattype/core";

encode({ name: "John", age: 30, city: "New York" });
// name: John
// age: 30
// city: New York
```

Arrays of same-shaped objects, the shape of most list endpoints, become a table. Field names are written once and nested fields are flattened into the header:

```ts
encode({
  page: 1,
  users: [
    { id: 1, name: "Alice", address: { city: "Paris" } },
    { id: 2, name: "Bob", address: { city: "Delhi" } },
  ],
});
// page: 1
// users[2]{id,name,address.city}:
//   1, Alice, Paris
//   2, Bob, Delhi
```

`decode` turns the text back into exactly the value `JSON.parse(JSON.stringify(value))` would give you.

## Install

```sh
npm install @flattype/core
```

No third-party dependencies, ESM + CJS + types, under 4 KB min+gz.

## How much smaller?

`pnpm compare` on the fixtures in [`fixtures/`](fixtures/index.mjs) (Node 24, Apple Silicon):

| Payload | JSON | [TOON](https://github.com/toon-format/toon) | Flat Notation | Flat vs JSON |
| --- | ---: | ---: | ---: | ---: |
| List of 100 users (nested address) | 16,691 B | 18,589 B | **9,151 B** | **45% smaller** |
| List of 1,000 users | 169,545 B | 188,544 B | **93,606 B** | **45% smaller** |
| Single profile object | 146 B | 133 B | 151 B | 3% larger |
| Mixed-shape events | 3,606 B | 3,785 B | 3,599 B | same |

What this means:

- **The savings come from lists.** A single small object is about the same size as JSON. Repeated objects shrink by about half, because the keys are written once.
- **It's not mainly about network size.** Gzip already removes most of JSON's repeated keys, so gzipped sizes end up close. The real win is anywhere the text isn't compressed: **LLM prompts and tool results** (you pay per token), logs, and in-memory caches.
- **Decoding is slower than `JSON.parse`, but not by much.** `JSON.parse` is native C++. `decode` runs at about 2.5× its time (0.7 ms against 0.3 ms for 1,000 rows), and is about 8× faster than the TOON reference decoder.

## The format

```
# Comments start with #
name: John                  # strings are bare unless ambiguous
zip: "10001"                # …so a numeric-looking string is quoted
user.address.city: Paris    # nested objects → dot paths
"first name": John          # keys that aren't [A-Za-z0-9_$-]+ are quoted
tags[]: admin, editor       # array of primitives, inline
items[0].id: 1              # mixed arrays → indexed paths
items[1]: 2
empty: {}                   # empty object / array
none: []
users[2]{id,name}:          # table: count, fields, then one row per line
  1, Alice
  2, Bob
```

(The `#` notes above are for explanation only. A comment must be on its own line.)

| Value | Written as |
| --- | --- |
| `null`, `true`, `false`, numbers | bare, exactly as in JSON |
| strings | bare, or JSON-quoted if empty, padded, multi-line, starting with `"`, or if they would read as a number, `null`, `true`, `false`, `{}` or `[]` |
| strings inside inline arrays and table rows | also quoted if they contain the delimiter |
| a root that isn't an object | `: 42`, `[]: 1, 2`, `[2]{id}:` … |

**Other delimiters.** `encode(value, { delimiter: "|" })` (or `"\t"`) records the delimiter in the brackets, as `tags[|]:` or `users[2|]{id|name}:`, so `decode` needs no options.

## API

```ts
encode(value, { delimiter?: "," | "|" | "\t", indent?: number, tabular?: "auto" | "off" }): string
decode(text, { strict?: boolean }): JsonValue
flatten(value): Record<string, leaf>   // { "user.name": "John", "tags[0]": "a" }
unflatten(record): JsonValue
stats(value, options?): { jsonBytes, flatBytes, saved }
```

**`decode` errors.** It throws `FlatDecodeError` (with `line` and `column`) on malformed input. With `{ strict: false }` it recovers instead: duplicate keys overwrite, missing values become `null`, and short tables are accepted. That suits text written by an LLM.

**Encoding follows `JSON.stringify` semantics.** `toJSON` is honoured (Dates become ISO strings). `undefined` and functions are dropped from objects and become `null` in arrays. `NaN` and `Infinity` become `null`. Cycles and BigInt throw.

## Development

```sh
pnpm install
pnpm build && pnpm typecheck && pnpm test
pnpm bench        # vitest bench: encode/decode vs JSON
pnpm compare      # bytes / gzip / parse time vs JSON and TOON
pnpm check:size   # bundle budget
```

## License

MIT
