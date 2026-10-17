# Flat Notation format

This page is a tour of Flat Notation. The precise definition, with the grammar, every error and the exact text an encoder writes, is the [Flat Notation 1.0 specification](/guide/spec). **The format is stable:** text written by any 1.x version decodes the same way in every later 1.x version.

- **Media type:** `text/x-flat` (send `charset=utf-8`)
- **File extension:** `.flat`
- **Encoding:** UTF-8

## At a glance

```
# A comment
name: John
zip: "10001"
user.address.city: Paris
"first name": John
tags[]: admin, editor
items[0].id: 1
items[1]: 2
empty: {}
none: []
users[2]{id,name}:
  1, Alice
  2, Bob
```

decodes to

```json
{
  "name": "John", "zip": "10001", "user": { "address": { "city": "Paris" } }, "first name": "John",
  "tags": ["admin", "editor"], "items": [{ "id": 1 }, 2], "empty": {}, "none": [],
  "users": [{ "id": 1, "name": "Alice" }, { "id": 2, "name": "Bob" }]
}
```

## Lines

A document is a sequence of lines separated by `\n`. A `\r` at the end of a line is ignored.

- **Blank lines** are skipped, and so are lines whose first non-blank character is `#` (comments).
- **Leading spaces and tabs** before an entry are ignored.
- **Every other line is an entry:** a path, a colon, and then either a value, an inline array, or a table header.
- **Table rows are the exception:** the *N* lines after a table header are its rows, read as they are, even if they are blank or start with `#`.

An empty document decodes to `{}`.

## Paths

```text
entry   = path ":" [ value ]
        | path "=" ( path | "~" )                 (* reference, needs refs: true *)
        | path "[" mark "]" ":" cells            (* inline array *)
        | path "[" count mark "]" "{" fields "}" ":"  (* table header *)
path    = [ ( key | index ) { "." key | index } ]
index   = "[" digits "]"
key     = bare | json-string
bare    = 1*( "A"–"Z" | "a"–"z" | "0"–"9" | "_" | "$" | "-" )
mark    = "" | "|" | TAB          (* the delimiter: "" means "," *)
fields  = field { mark-or-comma field }
field   = key { "." key }
```

- **Path parts:** `a.b` is key `b` inside object `a`, and `a[0]` is the first element of array `a`. A key that isn't bare is written as a JSON string: `"first name"`, `"a.b"`, `"@type"`.
- **The empty path** means the root. That's how non-object roots are written: `: 42`, `[]: 1, 2`, `[2]{id}:`.
- **One space after the colon is written,** and whitespace around a value is ignored.

## Values

After the colon, the trimmed text is read as:

| Text | Value |
| --- | --- |
| `null`, `true`, `false` | those literals |
| JSON number syntax (`-12`, `0.5`, `1e21`) | a number |
| `{}` / `[]` | an empty object / array |
| `"…"` (a JSON string, with JSON escapes) | that string |
| anything else | the text itself, as a string |

So `zip: 10001` is a number and `zip: "10001"` is a string. `version: 1.0.0` and `id: 007` are strings, because they aren't JSON numbers.

**When the encoder quotes a string.** Quoting is the only way to tell a string apart from the other values, so the encoder quotes a string when it:
- is empty, or has leading or trailing whitespace
- starts with `"`
- contains a control character (newline, tab, …)
- would read as something else: `null`, `true`, `false`, a JSON number, `{}` or `[]`
- in an inline array or table row only: contains the delimiter

Colons, `#` and other punctuation are fine unquoted in a value: `url: http://x.io/a#b`.

**Integers have no size limit.** The format is text, so `id: 18446744073709551617` is that exact integer. How it is read depends on the language: JavaScript numbers round past 2⁵³ (as with `JSON.parse`) unless you decode with `{ bigint: true }`, which gives a `BigInt` for every integer that a number can't hold exactly. Python ints are always exact. Encoders write a `BigInt` (or a Python int) as its digits. An integer longer than 4,300 characters is read as a number (a float) by both, so a hostile document can't make the decoder slow.

**There are no other types.** Dates, bytes, sets and maps travel as strings, arrays and objects, so every reader sees the same plain values. [`@flattype/core/types`](https://github.com/karammm/flattype#big-integers-dates-bytes-and-other-types) and `flattype.types` convert them at each end, and models (`"date"`, `"bytes"`, `"bigint"` fields) give them their types back.

## Inline arrays

`path[]: v1, v2, v3` is an array of primitives. Cells are split on the delimiter outside quoted strings, and each cell is trimmed and read like a value.
- **Other delimiters** are written inside the brackets: `tags[|]: a | b` or `tags[\t]: a⇥b`.
- **An empty array** is `path: []`, never `path[]:`.

## Tables

```
path[count]{field1,field2.sub}:
  v1, v2
  v1, v2
```

- **Shape:** an array of `count` objects. The next `count` lines are its rows, one object per row, with values in field order.
- **Fields** are dot paths inside each row object, so nested objects flatten into the header.
- **Indentation is cosmetic:** rows are counted, not detected by their indent. The default indent is 2 spaces.
- **When the encoder writes a table:** for an array of objects that all have the same leaf paths in the same order, with only primitive values, at least one key, and no arrays or empty objects inside. Any other array is written with indexed paths (`items[0].id: 1`).

## Building the value

Entries are applied in order, creating objects and arrays along their paths.
- **Arrays fill in order:** an index must be the array's current length (append), or an existing element (when descending into it).
- **Duplicates and conflicts are errors:** setting the same leaf twice, or using one path as both a value and a container.
- **Keys are own properties,** including `__proto__`. Nothing is ever assigned to a prototype.

Whatever `JSON.stringify` can write, `encode` writes as well, with the same rules: `toJSON` is called, then the `replacer` if there is one, `undefined` and functions are dropped (or become `null` in arrays), `NaN` and `Infinity` become `null`, and a BigInt is written as its digits. Cycles throw, unless `refs` is on. **`decode(encode(x))` deep-equals `JSON.parse(JSON.stringify(x))`** for every value. Property-based tests check this on every change.

A `reviver` passed to `decode` runs on the finished value, children before parents, in the order `JSON.parse` uses. A random-value test checks that the two call the reviver with the same keys and values in the same order.

## References

```text
lead.id: 1
lead.team = ~
members[0] = lead
```

A line `path = target` puts the object or array found at `target` at `path` as well. Both are the same object, not copies. `~` is the root.
- **Only with `refs: true`.** Without it, a reference is an error, or skipped in lenient mode.
- **Resolved at the end:** references are filled in once the whole document has been read, in document order. That's how a cycle can point at a parent that is still being written.
- **The target must exist and be an object or array.** It may pass through a reference that appears earlier, but not through one that appears later. A missing or primitive target is an error (lenient mode: `null`).
- **The reference owns its path:** nothing can be written below it (`b = a` then `b.x: 1` is a path conflict).
- **What the encoder writes:** with `refs: true`, the first time it meets an object it writes it in full, and every later time it writes a reference to that first path. A table is only used when none of its rows (or objects inside them) appears anywhere else. A row can still be the target of a reference: `admin = users[1]`.

## Errors and lenient mode

Malformed input throws `FlatDecodeError`, which has a 1-based `line` and `column`.

`decode(text, { strict: false })` instead recovers what it can. That's what `fromModelOutput` and `flattype decode --lenient` use. Every repair is reported to `onWarning` as `{ message, line, column }`, where the message names the problem and the repair (`Expected 5 values, got 4: the missing values are null`).

| Problem | Strict | Lenient |
| --- | --- | --- |
| Missing value (`a:`) | error | `null` |
| Duplicate key or index | error | the last one wins |
| Skipped index (`a[2]` before `a[0]`) | error | filled with `null`, up to 1,000 entries; a bigger gap is still an error |
| Fewer table rows than declared | error | the rows that are there |
| Wrong number of cells in a row | error | missing cells are `null` |
| Unterminated quoted string | error | the raw text |
| Reference without `refs: true` | error | skipped |
| Table header without its `:` (nothing else on the line) | error | read as a table |
| Reference to a missing path | error | `null` |

A line that isn't an entry at all is an error in both modes, unless `skipInvalidLines: true` is set: then it is skipped (and reported), leaving no trace in the result. `fromModelOutput` uses that, for example for prose around the data.

## Streaming

`createDecoder()` reads the same format chunk by chunk, with chunks split anywhere, even inside a line or a character. It reports each table row as soon as its line is complete. The result is exactly what `decode` gives for the whole text.

## Other languages

The format is the same in every language. The [specification](/guide/spec) defines it, the [conformance suite](/guide/conformance) checks an implementation in any language, and [writing a port](/guide/porting) explains how to build one. JavaScript and Python are [implemented](/guide/implementations) today.
