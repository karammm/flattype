# Flat Notation 1.1

- **Version:** 1.1, 17 October 2026. [Changes from 1.0](#appendix-f-changes) are additions: [1.0](https://github.com/karammm/flattype/blob/spec-v1.0/spec/SPEC.md) documents mean the same.
- **Status:** stable. Within 1.x, a valid document never changes meaning ([section 15](#15-versioning)).
- **Media type:** `text/x-flat; charset=utf-8`. **File extension:** `.flat`
- **Grammar:** [`grammar.abnf`](grammar.abnf), also in [appendix A](#appendix-a-grammar)
- **Test suite:** [`conformance/`](../conformance/README.md), with thousands of cases and a runner for any language
- **Reference implementations:** [`@flattype/core`](https://www.npmjs.com/package/@flattype/core) (JavaScript) and [`flattype`](https://pypi.org/project/flattype/) (Python)

Flat Notation is a line-based text format for JSON values. Each line sets one value at a path, and a list of objects becomes a table, with the keys written once (`?` marks a key that some objects lack):

```text
page: 1
user.name: Alice
tags[]: admin, editor
orders[2]{id,total,status,coupon?}:
  1001, 25.5, shipped, SPRING
  1002, 9.99, pending,
```

```json
{
  "page": 1,
  "user": { "name": "Alice" },
  "tags": ["admin", "editor"],
  "orders": [
    { "id": 1001, "total": 25.5, "status": "shipped", "coupon": "SPRING" },
    { "id": 1002, "total": 9.99, "status": "pending" }
  ]
}
```

A list that can't be a table is written item by item. `[+]` starts the next item, and the lines after it that start with `.` continue it:

```text
events[+].type: push
.commits[1]{sha,message}:
  a1f, fix typo
events[+].type: star
.user.login: ann
```

```json
{
  "events": [
    { "type": "push", "commits": [{ "sha": "a1f", "message": "fix typo" }] },
    { "type": "star", "user": { "login": "ann" } }
  ]
}
```

It is designed to be small on the wire and in a language model's context, easy for people and models to read and write, and an exact round trip for every JSON value.

This document defines the syntax, what a document means, the canonical text an encoder writes, and the optional features (references, lenient decoding and streaming). It is precise enough to build an implementation from it alone. The [porting guide](PORTING.md) adds practical advice, and the [conformance suite](../conformance/README.md) checks the result.

## Contents

1. [Conventions](#1-conventions)
2. [Documents](#2-documents)
3. [Lines and entries](#3-lines-and-entries)
4. [Paths](#4-paths)
5. [Values](#5-values)
6. [Building the value](#6-building-the-value)
7. [Numbers](#7-numbers)
8. [References](#8-references)
9. [Errors](#9-errors)
10. [Lenient decoding](#10-lenient-decoding)
11. [Streaming](#11-streaming)
12. [Encoding](#12-encoding)
13. [Security considerations](#13-security-considerations)
14. [Conformance](#14-conformance)
15. [Versioning](#15-versioning)

Appendices: [A. Grammar](#appendix-a-grammar), [B. Whitespace](#appendix-b-whitespace), [C. Number formatting](#appendix-c-number-formatting), [D. Messages](#appendix-d-messages), [E. Notes on the reference implementations](#appendix-e-notes-on-the-reference-implementations), [F. Changes](#appendix-f-changes)

## 1. Conventions

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY** and **OPTIONAL** are to be interpreted as described in [BCP 14](https://www.rfc-editor.org/info/bcp14) (RFC 2119, RFC 8174) when, and only when, they appear in all capitals.

- **Value:** a JSON value as in [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259): null, true, false, a number, a string, an array, or an object (string keys, each at most once, in order). Flat Notation adds no other types.
- **Decoder:** turns a document into a value. **Encoder:** turns a value into a document.
- **Code point:** a Unicode code point. Text is a sequence of code points, and every length, position and column in this document counts code points.
- **Whitespace:** the code points listed in [appendix B](#appendix-b-whitespace), exactly those that JavaScript's `String.prototype.trim` removes. **Trimming** text removes whitespace from both ends.
- `SP` is U+0020 (space), `HTAB` is U+0009 (tab), `LF` is U+000A and `CR` is U+000D. In examples, `⇥` stands for HTAB.
- **1.1:** marks what this version adds to [Flat Notation 1.0](https://github.com/karammm/flattype/blob/spec-v1.0/spec/SPEC.md). A decoder for 1.0 rejects these documents rather than misreading them.
- Grammar rules are written in ABNF ([RFC 5234](https://www.rfc-editor.org/rfc/rfc5234), with `%s` from [RFC 7405](https://www.rfc-editor.org/rfc/rfc7405)) and refer to [appendix A](#appendix-a-grammar).

## 2. Documents

A **document** is a sequence of code points. When it is stored or sent as bytes, it MUST be encoded as UTF-8, and its media type is `text/x-flat` with `charset=utf-8`.

- **Byte order mark:** a document MUST NOT start with U+FEFF. A decoder that receives bytes MAY remove a leading UTF-8 byte order mark before decoding, as the WHATWG `TextDecoder` does. In a string handed to a decoder, U+FEFF is an ordinary character (and fails the first line).
- **Unpaired surrogates** (U+D800 to U+DFFF on their own) can only occur in text held in UTF-16 strings, never in UTF-8. Decoders read them as ordinary code points. They don't make an encoder quote a string, but a quoted string escapes them ([section 12.3](#123-strings)).
- **Empty document:** a document with no entries (empty, or only blank lines and comments) decodes to the empty object `{}`.

## 3. Lines and entries

### 3.1 Lines

A document is split into **lines** at every LF. The text after the last LF is a line too, so a document that ends with LF ends with an empty line. If a line ends with CR, that one CR is removed before the line is read. No other code point ends a line: a CR elsewhere, U+2028 and U+2029 are ordinary characters inside a line (and whitespace when values are trimmed).

Lines are numbered from 1. A **column** is the position of a code point in its line, from 1.

Each line is one of the following, decided in this order:

1. **A table row,** if a table header ([section 3.3](#33-tables)) is still waiting for rows. Every line is then a row, read verbatim: blank lines and lines starting with `#` are rows too.
2. **Blank:** nothing but SP and HTAB. It is skipped.
3. **A comment:** the first code point that isn't SP or HTAB is `#`. It is skipped. There are no comments at the end of a line: in `url: http://x.io/a#b`, the `#b` is part of the value.
4. **An entry:** anything else. Leading SP and HTAB are skipped (and only those: any other whitespace starts the path and fails it). An entry whose path starts with `.` continues an item ([section 3.4](#34-items)).

### 3.2 Entries

An entry is a [path](#4-paths) followed by one of these, with the path's last part deciding which:

| Entry | Example | Rule |
| --- | --- | --- |
| **Pair**: a path, `:` and one value | `user.name: Alice` | `pair` |
| **Inline array**: `[]` (with another delimiter inside for pipes or tabs), `:` and cells | `tags[]: admin, editor` | `inline` |
| **Table header**: `[count]{fields}:` | `users[2]{id,name}:` | `header` |
| **Reference**: `=` and a target path ([section 8](#8-references)) | `owner = users[0]` | `reference` |

- **The colon follows the path directly.** `a : 1` is an error, not the key `a`.
- **The text after the colon** is the value (for a pair) or the cells (for an inline array). For a table header, only whitespace may follow the colon.
- **The empty path** is the root, which is how a document whose value isn't an object is written: `: 42`, `: x`, `[]: 1, 2`, `[2]{id}:`, `[+].id: 1`.

### 3.3 Tables

A table header `path[N]{f1,f2,…}:` declares an array of N objects at `path`. The next N lines are its rows, whatever they contain. Each row holds one cell per field, in field order, and becomes one object: the cell for field `f` is set at path `f` inside that row object ([section 6.3](#63-tables)).

- **The count** N is one or more ASCII digits. Leading zeros are allowed (`[02]`). A count of 0 declares an empty array with no rows.
- **The fields** are written between `{` and `}`. Each is one or more keys joined by `.`, never an index: `{id,user.name,"first name"}`. SP may surround each field (not HTAB, and no other whitespace).
- **Optional fields** (1.1) have a `?` right after their last key: `{id,phone?,address.city?}`. In a row, an empty cell of an optional field means the row object doesn't have that key. Fields without `?` must have a value in every row.
- **The delimiter** separates both the fields and the cells of every row. It is `,` by default. A table with a different delimiter has it after the count: `[N|]{a|b}:` uses `|`, and `[N⇥]{a⇥b}:` uses HTAB.
- **Indentation is cosmetic.** Rows are counted, not recognized by their indent. Encoders indent them by 2 spaces by default.
- **A short table,** one that the document ends before its N rows have been read, is an error (lenient decoders repair it, [section 10](#10-lenient-decoding)).

### 3.4 Items

1.1. An array can be written one element at a time. A path segment `[+]` stands for the next element of an array: the index equal to its length when the line is read (0 if the array doesn't exist yet). A line whose path contains `[+]` **opens an item**: the element at its last `[+]`. A following entry whose path starts with `.` **continues** that item: its path is the item's path followed by what comes after the `.`, which starts with a key.

```text
list[+].id: 1          list[0].id: 1
.name: Ann             list[0].name: Ann
.tags[]: a, b          list[0].tags[]: a, b
list[+].id: 2          list[1].id: 2
.n[+]: x               list[1].n[0]: x, and the item is now list[1].n[0]
```

- **What ends an item:** any entry whose path doesn't start with `.`, unless it opens a new item. Blank lines, comments and table rows don't end it. A `.` line with no open item is the error `A '.' path needs a [+] item before it`.
- **A `.` line with `[+]` in it** opens a new item, inside the current one. The encoder never writes one.
- **Any entry can start with `.`,** except a reference ([section 8.1](#81-syntax)): `.k: v`, `.k[]: a, b`, `.k[2]{x}:`. A line that fails, or that lenient decoding skips, opens and ends nothing.
- **Reading a `.` line takes time proportional to its own length**, however long the item's path is ([section 13](#13-security-considerations)). Implementations keep where the item is, rather than its path.
## 4. Paths

A path is a sequence of **segments**, each a key (into an object) or an index (into an array). The first segment has no prefix, every later key is preceded by `.`, and an index is written in brackets directly after the previous segment:

```text
user.address.city      keys "user", "address", "city"
items[0].id            key "items", index 0, key "id"
matrix[1][0]           key "matrix", index 1, index 0
[3].name               index 3 (of a root array), key "name"
"first name"           key "first name"
a."b.c"                keys "a", "b.c"
```

- **Bare keys** are one or more of `A`–`Z`, `a`–`z`, `0`–`9`, `_`, `$` and `-`. A bare key of digits is still a key: `a.0` is the key `"0"`, while `a[0]` is index 0.
- **Quoted keys** are JSON strings (RFC 8259, section 7), with JSON escapes. Any key can be quoted, and a key that isn't bare must be: `""`, `"a b"`, `"a.b"`, `"@type"`, `"[0]"`, `"é"`.
- **Indexes** are one or more ASCII digits in brackets. Leading zeros are allowed and ignored (`[007]` is 7). The index is the nearest IEEE 754 double to the decimal number the digits form (so absurdly long indexes round, and are then out of range anyway).
- **`[+]`** (1.1) is the next element of an array ([section 3.4](#34-items)). Before a line is applied, every `[+]` in its path is replaced by that number. It can't be used in a reference target, in a table field, or in `unflatten`.
- **Terminals:** the brackets of an inline array (`[]`, `[|]`, `[⇥]`) and of a table header (`[N]{…}`, `[N|]{…}`, `[N⇥]{…}`) can only end a path. `[1|]` anywhere else is an error.

The grammar is the `path` rule. Reading stops at the first code point that can't continue the path, and the entry decides what must come next ([section 3.2](#32-entries)).

## 5. Values

### 5.1 Tokens

A **token** is the text of one value: for a pair, everything after the colon, trimmed. A token is read as the first of these that matches all of it:

| Token | Value |
| --- | --- |
| `null`, `true`, `false` (exactly, case-sensitive) | null, true, false |
| `{}` | an empty object |
| `[]` | an empty array |
| JSON number syntax (rule `number`): `-12`, `0.5`, `1e21`, `-0`, `2E-3` | a number ([section 7](#7-numbers)) |
| a token starting with `"` | a JSON string with JSON escapes. It MUST be exactly one valid JSON string, or it is an error (`Invalid quoted string`). |
| anything else | the token itself, as a string |

So `zip: 10001` is a number and `zip: "10001"` is a string, while `version: 1.0.0`, `id: 007`, `n: +1`, `x: .5`, `y: NaN` and `z: Infinity` are strings, because they aren't JSON numbers. Colons, `#`, quotes after the first character and other punctuation are ordinary text: `time: 12:30`, `note: say "hi"`.

An empty token (`a:`, or `a:` followed only by whitespace) is an error, `Missing value`. The empty string is written `""`.

### 5.2 Cells

The text after an inline array's colon, and every table row, is a list of **cells** separated by the delimiter. Each cell is one token. A cell is read like this, starting at the beginning of the text:

1. Skip SP and HTAB (only SP when the delimiter is HTAB).
2. **If the next code point is `"`,** the cell is a quoted string. It ends at the first `"` not preceded by an escaping `\`, and the quoted text MUST be a valid JSON string (`Invalid quoted string` otherwise, or `Unterminated string` if there is no closing quote). After it, only SP and HTAB may come (only SP for the HTAB delimiter) before the delimiter or the end of the text (`Expected delimiter after quoted string` otherwise). The delimiter can appear inside the quotes.
3. **Otherwise,** the cell is the text up to the next delimiter (or the end), trimmed, read as a token ([section 5.1](#51-tokens)). An empty cell is `Missing value`, except in a table row, for an optional field (1.1): there it is **absent**. Such a token can still be a quoted string, when other whitespace (a no-break space, say) comes before its `"`, but then it can't contain the delimiter.
4. If a delimiter follows, skip it and read the next cell. A delimiter at the very end means one more cell, which is empty: `a[]: x,` is `Missing value`.

There is always at least one cell, so `a[]:` with nothing after it is `Missing value`. An empty array is written `a: []`.

## 6. Building the value

### 6.1 Assignment

A decoder reads entries in document order and builds the value as it goes. It starts with a **holder**: an object with one slot, `root`, that is empty. Each pair, inline array, finished table and reference **assigns** a value at its path, once each `[+]` in it has been replaced by its index ([section 3.4](#34-items)). A `.` line assigns from the slot of its item, which gives the same result as assigning its whole path from the holder:

```text
assign(holder, segments, value):
  parent ← holder, key ← "root"
  for each segment s:
    child ← SLOT(parent, key, new = (s is an index ? [] : {}), leaf = false)
    if s is an index and child isn't an array, or s is a key and child isn't an object:
      error "Path conflict at K"        (K is 'key' for a key, [key] for an index)
    parent ← child, key ← s
  SLOT(parent, key, value, leaf = true)

SLOT(parent, key, new, leaf):
  if parent is an array (key is an index; n is the array's length):
    if key < n:  if leaf: problem "Duplicate index [key]"   (lenient: replace the element)
                 return the element at key
    if key > n:  problem "Index [key] skips [n]"           (lenient: append null until n = key, but if
                 key − n > 1000, error "Index [key] is too far past [n]")
    append new, return it
  else (parent is an object):
    if parent has key:
      if not leaf: return its value
      problem "Duplicate key 'key'"                         (lenient: replace the value, keeping its place)
    set key to new (as the last key), return it
```

A **problem** is an error in strict mode ([section 9](#9-errors)). In lenient mode it is a warning, and the repair in parentheses is made ([section 10](#10-lenient-decoding)). The quoted key in a message is the key exactly as it is, unescaped. An index in a message is written as a number ([section 12.6](#126-numbers)).

When the document has been read, the value is the holder's `root`, or `{}` if nothing was ever assigned.

What follows from this:

- **Objects and arrays are created along the way.** `a.b.c: 1` creates `a` and `a.b`.
- **Arrays fill in order.** An index must be the array's length (to append) or an existing element (to descend into it). `a[1]: x` before `a[0]` is `Index [1] skips [0]`.
- **Duplicates are errors.** Setting the same leaf twice (`a: 1` then `a: 2`) is a duplicate, and so is setting a leaf where an object or array already is (`a.b: 1` then `a: 2`, which is `Duplicate key 'a'`).
- **Conflicts are errors.** Using a value as a container (`a: 1` then `a.b: 2`, `Path conflict at 'a'`) or an object as an array (`a.b: 1` then `a[0]: 2`) is a conflict, even in lenient mode.
- **Empty containers can be filled.** `a: {}` then `a.b: 1` gives `{"a": {"b": 1}}`, and `a: []` then `a[0]: 1` gives `{"a": [1]}`: they descend into the existing container.
- **The root follows the same rules.** `: 1` then `: 2` is `Duplicate key 'root'`, and `: 1` then `a: 2` is `Path conflict at 'root'`.

### 6.2 Keys

- **Keys are data.** Every key, including `__proto__`, `constructor` and `prototype`, MUST be stored as an ordinary entry of its object. A decoder MUST NOT let any key reach a prototype, a class, a setter or any other behaviour.
- **Order:** a decoder SHOULD keep keys in the order they were first set, as JSON parsers do. Where the platform's objects impose their own order (JavaScript puts integer-like keys first), that order is acceptable: values are compared as JSON, where key order doesn't matter.

### 6.3 Tables

A table header opens a table. Each of the next N lines is a row:

1. Split the row into cells ([section 5.2](#52-cells)). If there are not exactly as many cells as fields, that is the problem `Expected F values, got C` (lenient: missing cells are null, extra cells are dropped).
2. Build the row object: starting from an empty object, assign each cell at its field's path, in field order, with the rules of [section 6.1](#61-assignment) (so `{a,a.b}` is `Path conflict at 'a'` and `{a.b,a}` is `Duplicate key 'a'`). An absent cell is skipped, so if every field under `address` is absent, the row has no `address`.
3. Add the row object to the table's array.

When the last row has been read, or at once for a count of 0, the array is assigned at the header's path. Errors from that assignment carry the header's line number. If the document ends first, the table is short: `Expected N rows, got R`, reported for the header's line (lenient: the array has the rows that were read, and is assigned).

### 6.4 Inline arrays

An inline array is the array of its cells' values, assigned at its path.

## 7. Numbers

A number token denotes the exact decimal number it spells. A decoder turns it into a number like this:

- **Integers** are tokens without a fraction or exponent (`-?digits`). An integer token of at most 4,300 characters (sign included) is that exact integer. A decoder SHOULD return every such integer exactly, using an arbitrary-precision or 64-bit type where the value needs it. A decoder for a platform whose ordinary number type is a double MAY return the nearest double, but SHOULD offer an option for exact integers (as `@flattype/core` does with `{ bigint: true }`). An integer token longer than 4,300 characters is read as a double (see [section 13](#13-security-considerations)).
- **Other numbers** are read as the nearest IEEE 754 binary64 value (round half to even). A magnitude beyond the double range becomes positive or negative infinity, and one below it becomes zero. Encoders never write such numbers, because they write non-finite numbers as `null`.
- **`-0`** is an integer token, so it is the integer 0. A decoder whose numbers are all doubles MAY return negative zero (JavaScript does), and `-0.0` is negative zero wherever floats have it.
- **Integer and double are not different values.** Comparing values as JSON, `30` equals `30.0`. A decoder for a language that distinguishes integers from floats returns an integer for an integer token and a float otherwise: `1.0` and `1e2` are floats, `100` is an integer.

## 8. References

References are OPTIONAL. They let a document describe the same object at several paths, including cycles. A decoder MUST NOT resolve them unless they are enabled (an option, off by default), and an encoder MUST NOT write them unless asked.

```text
lead.id: 1
lead.team = ~
members[0] = lead
```

decodes to an object whose `members[0]` is the very same object as `lead`, and whose `lead.team` is the root itself.

### 8.1 Syntax

A reference is `path = target`: a path that doesn't end in an inline array or table header, any number of SP, `=`, any number of SP, then either `~` (the root) or a path that doesn't end in an inline array or table header, and nothing after it but SP. The rule is `reference`. A line is a reference when `=` follows its path (after any SP).

- **Disabled** (the default): the line is the problem `References need { refs: true }`, at the column of `=`, found before the rest of the line is read (lenient: the line is skipped).
- **Enabled:** `= target` with an empty path is the error `The root can't be a reference`. Anything after `=` that isn't `~` or a plain path (without `[+]`) is `Expected a path or '~' after '='`, and anything after the target but SP is `Unexpected text after reference`.
- **A reference is a whole path** (1.1): one whose path starts with `.` is the error `A reference can't start with '.'`, at the column of the `.`. Its path may open an item with `[+]` (`list[+] = list[0]`).

### 8.2 Meaning

The reference's path is assigned a **placeholder**, with the usual rules of [section 6.1](#61-assignment). A placeholder is neither an object nor an array, so nothing can be written below it: `b = a` then `b.x: 1` is `Path conflict at 'b'`.

When the whole document has been read (and a short table assigned), the placeholders are **resolved in document order**:

1. If the placeholder is no longer at its path (in lenient mode, a later line can replace it), it is skipped.
2. The target is looked up from the root, one segment at a time, with JavaScript's rules for own properties:
   - a key on an object is that key's value, if the object has it;
   - an index on an object is the key spelled by the index's decimal digits (`[0]` reads the key `"0"`);
   - an index on an array is that element, if it is in range;
   - a key on an array is nothing, except `length`, which is the array's length (a number);
   - anything on a value that isn't an object or array, or on nothing, is nothing.
   A placeholder that has already been resolved is the object it was resolved to, so a target can pass through an earlier reference.
3. If the target is an object or array, the placeholder is replaced by **that same object or array** (not a copy). Otherwise it is the problem `Reference target 'T' doesn't exist` (nothing was found), `isn't an object or array` (a primitive was found), or `is a reference that comes later` (an unresolved placeholder was found, which includes the reference itself). `T` is the target in canonical path form ([section 12.2](#122-paths-and-keys)), or `~`. The line is the reference's line and the column is 1. Lenient: the placeholder becomes null.

A decoded value with references can be a graph with cycles, so it isn't a JSON value. Walking it naively never ends.

## 9. Errors

A **strict** decoder (the default) MUST reject any document that doesn't match the grammar, or that breaks a rule in [sections 3](#3-lines-and-entries) to [8](#8-references). It MUST stop at the first error and report:

- **the reason**, such as `Missing value`;
- **the line** (from 1);
- **the column** (from 1, in code points).

The display form SHOULD be `reason (line L, column C)`, for example `Missing value (line 1, column 3)`.

**Which error is first.** Lines are read in order, and within a line, left to right: first the path, then the `=` or `:` after it, then the value or the cells (left to right, then the cell count), then the assignments. A table's own assignment is checked when its last row has been read, a short table at the end of the document, and then the references, in document order.

**Columns** point at the problem: the code point that can't continue the path, the first code point of a value or cell, the `=` of a reference. Problems with the meaning of a line (duplicates, conflicts, skipped indexes, cell counts, row counts and reference targets) have column 1. [Appendix D](#appendix-d-messages) gives every reason, its column and its lenient repair.

The reasons are English, and a decoder that passes the **Messages** level ([section 14](#14-conformance)) reports them word for word. Other decoders MAY word them differently, but MUST report the same line and column.

## 10. Lenient decoding

Lenient decoding is OPTIONAL. It reads text from language models and people, which is often almost right, and repairs what it can instead of rejecting the document. A decoder MUST NOT decode leniently unless asked.

In lenient mode, the problems below are not errors. The decoder makes the repair and reports a **warning**, with the message `reason: repair`, the line and the column (the same as the strict error would have):

| Reason | Repair (in the message) | What happens |
| --- | --- | --- |
| `Missing value` | `read as null` | The value or cell is null. |
| `Invalid quoted string` | `kept as text` | The token, quotes included, is a string. |
| `Unterminated string` | `kept as text` | The rest of the line after the opening quote is the last cell, as is. |
| `Expected delimiter after quoted string` | `the text after it is dropped` | The text up to the next delimiter is ignored. |
| `Expected F values, got C` | `the missing values are null` / `the extra values are dropped` | |
| `Expected N rows, got R` | `the table has the rows that are there` | |
| `Table rows go on the following lines` | `the text after the header is ignored` | |
| `Expected ':' after the table header` | `read as a table anyway` | Only for a complete header followed by nothing but whitespace. |
| `Duplicate key 'k'`, `Duplicate index [i]` | `the last value is kept` | |
| `Index [i] skips [n]` | `the gap is filled with null` | Only for gaps of up to 1,000 entries. A bigger gap is the error `Index [i] is too far past [n]`, in lenient mode too. |
| `References need { refs: true }` | `the line is skipped` | |
| `Reference target 'T' …` | `read as null` | |

Every other problem (a malformed path, a conflict, a gap over 1,000) is still an error.

**Skipping invalid lines.** With this second option, an error on a line doesn't stop decoding. The line is dropped as if it weren't there, and its other warnings are replaced by a single one, `reason: the line is skipped`. A dropped line changes nothing, not even which item is open: a decoder MUST check a line fully before applying it. A table row that is dropped doesn't count as a row, and a table whose assignment fails is dropped with the warning `reason: the table is dropped`. If its header opened an item, there is then no open item.

Warnings are reported in the order their problems are found ([section 9](#9-errors)).

## 11. Streaming

A decoder MAY accept a document in chunks split anywhere, even inside a line or a code point's UTF-8 bytes (where it decodes bytes). The result, the errors and the warnings MUST be exactly those for the whole document at once.

A streaming decoder MAY report each table row as soon as its line is complete, with the table's path (in canonical form, [section 12.2](#122-paths-and-keys), empty for the root), the row's index and the row object. It MAY then let the caller drop the rows instead of keeping them in the table, so memory stays flat for long tables.

## 12. Encoding

An encoder turns a value into a document. With the default options, its output is the **canonical form** of the value. A conforming encoder MUST write exactly the canonical form, byte for byte, so that every implementation writes the same text.

### 12.1 Document

The document is a sequence of lines joined by LF, with no LF after the last one. The value is written by **writing it at the empty path** (below). An empty root object therefore writes nothing: the empty document.

Writing a value `v` at a path `p`:

- **A primitive** (null, a boolean, a number or a string): one line, `p: ` followed by the primitive ([section 12.3](#123-strings) to [12.6](#126-numbers)). At the root, `p` is empty and the line is `: 42`.
- **An object:** each key `k` in order, written at `p.k` ([section 12.2](#122-paths-and-keys)). An empty object writes `p: {}`, except at the root.
- **An array:**
  - empty: `p: []`;
  - every item a primitive: one line, the **inline array** `p[]: c1, c2, …`, with each item written as a cell ([section 12.4](#124-cells));
  - otherwise, if a **table** can be written ([section 12.5](#125-tables)), the table;
  - otherwise, **item by item**: each item `i` is written at `p[i]` (decimal, no leading zeros). Then, unless this array is inside an item already, its lines are rewritten as an item ([section 3.4](#34-items)): the first line's `p[i]` becomes `p[+]`, and in every later line (except table rows) the leading `p[i]` is removed, so it starts with `.`. That rewrite is not made for an item whose later lines would continue with `[` (an array written item by item, such as `[[1, {"a": 1}]]`), nor for an item of two or more lines that include a reference ([section 12.8](#128-references)). Those keep `p[i]` on every line.

```text
{"a": {"b": 1}, "e": {}, "f": [], "g": [1, "x y"], "h": [[1], {"k": 2, "m": [{"x": 1}, 2]}]}

a.b: 1
e: {}
f: []
g[]: 1, x y
h[+][]: 1
h[+].k: 2
.m[0].x: 1
.m[1]: 2
```

### 12.2 Paths and keys

A key is written bare if it is one or more of `A`–`Z`, `a`–`z`, `0`–`9`, `_`, `$` and `-`, and as a quoted string ([section 12.3](#123-strings)) otherwise. A path is its segments in order: the first key as it is, every later key after a `.`, and every index as `[i]`. The empty path is empty.

### 12.3 Strings

A string is written **bare**, as it is, unless one of these is true, in which case it is **quoted**:

- it is empty;
- it starts with `"`;
- it starts or ends with whitespace (it isn't equal to itself trimmed);
- it is exactly `null`, `true`, `false`, `{}` or `[]`;
- it matches the JSON number syntax (rule `number`);
- it contains a code point from U+0000 to U+001F;
- it is a cell (an inline array item or a table cell) and contains the delimiter.

Quoting writes exactly what JavaScript's `JSON.stringify` writes for the string: `"`, then each code point as it is, except `"` as `\"`, `\` as `\\`, U+0008 as `\b`, U+000C as `\f`, U+000A as `\n`, U+000D as `\r`, U+0009 as `\t`, every other code point from U+0000 to U+001F as `\u00XX`, and every unpaired surrogate as `\uXXXX` (lowercase hex digits, four of them), then `"`. Nothing else is escaped: not `/`, not U+007F, not U+2028, not non-ASCII text.

### 12.4 Cells

With delimiter `d`, the cells of an inline array or a table row are joined by `, ` for `,`, by ` | ` for `|`, and by a single HTAB for HTAB. Each cell is a primitive written as in [section 12.3](#123-strings) and [12.6](#126-numbers), with strings that contain `d` quoted. The inline array's brackets are `[]` for `,`, `[|]` for `|` and `[⇥]` for HTAB:

```text
tags[]: a, "b, c", d
tags[|]: a | b, c | d
```

### 12.5 Tables

An array (that isn't all primitives) is written as a table when the `tabular` option is on (the default), every item is an object, and the items' **leaf paths** fit one header. The leaf paths of an object are found by walking its keys in order:

- a primitive value is a leaf, at its key's path;
- an object value is walked in turn, its paths below its key's path (`user.name`);
- an array value, or an object (at any depth, including the item itself) with no keys, means the array can't be a table.

**When every item has the same leaf paths in the same order,** they are the fields. The table is the header line `p[N]{f1,f2,…}:`, where N is the number of items and each field is a leaf path ([section 12.2](#122-paths-and-keys)), joined by the delimiter with no spaces. Then one row per item: `indent` spaces (2 by default) and the item's leaf values as cells in field order. With delimiter `|` the header is `p[N|]{f1|f2}:`, and with HTAB it is `p[N⇥]{f1⇥f2}:`.

```text
[{"id": 1, "user": {"name": "Alice"}}, {"id": 2, "user": {"name": "Bob"}}]

[2]{id,user.name}:
  1, Alice
  2, Bob
```

**Otherwise** (1.1), the fields are merged from the items' leaf paths, item by item and path by path:

1. A path already in the fields must come after the previous path of the same item. If not, no table.
2. A new path goes just before the next path of the same item that is already in the fields, or at the end if there is none.
3. No table if the fields would become more than twice as many as the most leaf paths of any one item.

A field that some item lacks is **optional**, and is written with `?` after it in the header. There is no table if every field is optional, or if a field is a prefix of another at a `.` (`a` and `a.b`). In a row, a field the item lacks is an empty cell, and SP at the end of the row is removed.

```text
[{"id": 1, "name": "Ann", "phone": "555"}, {"id": 2, "name": "Bo"}, {"id": 3, "email": "c@x.io", "name": "Cy"}]

[3]{id,email?,name,phone?}:
  1, , Ann, "555"
  2, , Bo,
  3, c@x.io, Cy,
```

### 12.6 Numbers

- **Integers** that the value holds exactly (an integer type, such as a JavaScript `BigInt`, a Python `int` or a Go `int64`) are written as their decimal digits, with `-` when negative: `18446744073709551615`.
- **Floating-point numbers** (doubles) are written exactly as ECMAScript's `Number::toString` writes them in base 10: the shortest digits that round-trip, as `100`, `0.1`, `1e+21`, `1e-7`, `123456789012345680000` or `5e-324`. [Appendix C](#appendix-c-number-formatting) gives the algorithm. Negative zero is written `0`.
- **NaN and the infinities** are written `null`, as in JSON.

So a double that holds an integer is written without a fraction (`30.0` is written `30`), and decodes as an integer in languages that distinguish them.

### 12.7 Options

An encoder MAY offer these options. With any of them set to a value other than its default, the output is no longer the canonical form, but it MUST still be exactly what this section describes.

| Option | Values | Default | Effect |
| --- | --- | --- | --- |
| delimiter | comma, pipe or HTAB | comma | The delimiter of inline arrays and tables ([section 12.4](#124-cells)). |
| indent | an integer ≥ 0 | 2 | Spaces before each table row. |
| tabular | on, off | on | Off: arrays are never written as tables. |
| refs | on, off | off | Write shared objects once ([section 12.8](#128-references)). |
| target | 1.0, 1.1 | 1.1 | 1.0: write Flat Notation 1.0, which decoders for 1.0 read. It turns off optional fields (a table needs identical leaf paths) and `[+]` items (every item keeps `p[i]`). The output is exactly what a 1.0 encoder writes. |

### 12.8 References

Without the `refs` option, an object or array that appears more than once is written in full each time, and one that contains itself (a cycle) MUST be rejected with an error, as JSON serializers do.

With it, the encoder remembers each object and array it writes, and the path it was written at:

- **Seen before:** when the encoder is about to write an object or array it has already written (or started writing, as with a cycle back to a parent), it writes the line `p = first` instead, where `first` is the path of the first time, or `~` for the root.
- **Tables:** an array is written as a table only if, in addition to [section 12.5](#125-tables), none of the objects in its rows (the row objects and the objects inside them) has been written before, or appears twice in the table. A row object is then remembered at `p[i]`, and an object inside it at `p[i].path`.
- **Items:** paths are remembered as they are before the [section 12.1](#121-document) rewrite, `p[i]` and not `p[+]`, so a reference target is always a whole path. An item that is a single reference line is still rewritten (`list[+] = list[0]`).

```text
lead.id: 1
lead.team = ~
members[0] = lead
```

A decoder with references enabled reads this back into the same graph, and encoding that graph again gives the same text.

## 13. Security considerations

Decoders often read text from the network or from a language model, so these requirements apply to every decoder:

- **No prototype pollution.** Keys are data ([section 6.2](#62-keys)). No key may change anything but the object it is in.
- **References are opt-in.** Without them, a decoded value is a tree whose size is bounded by the document's size. With them, a few lines can describe a graph whose naive traversal never ends, so they MUST be off by default ([section 8](#8-references)).
- **Bounded gap filling.** Lenient decoding fills at most 1,000 missing array entries for one line, so `a[999999999]: 1` can't allocate a billion entries ([section 10](#10-lenient-decoding)).
- **Linear time.** A decoder SHOULD take time and memory proportional to the size of the document, for every input. The cases to watch are long lines delivered in small chunks, long digit runs, many dots in one path, lines that fail one way after another, and many `.` lines after an item with a very long path: a decoder that rebuilds the item's whole path for each `.` line takes time proportional to the square of the input ([section 3.4](#34-items)). The reference implementations test all of these in CI.
- **Long integers.** Converting a decimal integer of n digits to binary takes more than linear time in many libraries. That is why an integer token longer than 4,300 characters is read as a double (Python's limit for `int()`, for the same reason).
- **Deep values.** One line such as `a.a.a.…: 1` creates a value as deep as the line is long. A decoder SHOULD NOT build or walk values with recursion that such a line could exhaust.

Encoders face trusted values, but SHOULD reject cycles ([section 12.8](#128-references)) rather than loop.

## 14. Conformance

An implementation **conforms** to Flat Notation 1.1 (or 1.0) at one or more of these levels. The conformance suite checks each level separately, and an implementation's claims SHOULD name the levels it passes.

| Level | Requires | Suite cases |
| --- | --- | --- |
| **Decoder** (required) | Strict decoding ([sections 2](#2-documents) to [7](#7-numbers) and [9](#9-errors)): the same value, or an error at the same line and column | decode cases with default options, and every encode case's text |
| **Encoder** | The canonical form and the options of [section 12](#12-encoding), byte for byte | encode cases |
| **Exact integers** | Integers of any size encoded as digits and decoded exactly ([section 7](#7-numbers)) | big-integer cases |
| **Lenient** | [Section 10](#10-lenient-decoding): the same value and warnings at the same positions | decode cases with `strict: false` |
| **References** | [Section 8](#8-references) and [12.8](#128-references), in strict and lenient mode (so it needs Lenient too) | decode cases with `refs: true`, and the object-graph cases |
| **Messages** | Every error reason and warning message word for word ([appendix D](#appendix-d-messages)) | every decode case with an error or warnings |
| **Unpaired surrogates** | Strings with unpaired surrogates ([section 2](#2-documents)), only for platforms whose strings can hold them (JavaScript, Java, C#) | the encode cases that contain them, which the other levels leave out |

Streaming ([section 11](#11-streaming)) has no level of its own: a streaming decoder must pass the same cases with any chunking.

The [conformance suite](../conformance/README.md) is generated from the JavaScript reference implementation and is the final word. The 1.1 suite includes encode cases with `target: 1.0`. The 1.0 suite is kept, unchanged, in `conformance/1.0/`, for implementations of 1.0; a 1.1 implementation passes it at every level but Messages (lines starting with `.` now have their own message). If this document and the suite disagree, one of them has a bug, and both are fixed. if this document and the suite disagree, Report it in an [issue](https://github.com/karammm/flattype/issues).

## 15. Versioning

This specification has a version of its own, `major.minor`, independent of the packages that implement it.

- **Minor versions** only add. Every document that is valid in 1.0 decodes to the same value in every 1.x. A minor version MAY give meaning to text that is an error in earlier versions (their decoders reject such a document rather than misreading it), and MAY change the canonical form to use it.
- **Every 1.x encoder can write 1.0** (the `target` option, [section 12.7](#127-options)), byte for byte as a 1.0 encoder does. That is what keeps old readers working: write 1.0 for a reader that may be older, such as an HTTP client that didn't say which version it reads.
- **Messages** (reasons and repairs) MAY change in a minor version, with the suite. Lines and columns don't.
- **A major version** would be needed for anything else, and isn't planned.

Documents carry no version number. A 1.x document is read by a 1.x decoder whose minor version is the same or later. Over HTTP, a client says which version it reads with a `version` parameter: `Accept: text/x-flat; version=1.1`. A server that sees no version, or a lower one, writes 1.0.

## Appendix A. Grammar

This is [`grammar.abnf`](grammar.abnf). [`conformance/grammar.mjs`](../conformance/grammar.mjs) checks every document in the conformance suite against it, and a randomized test checks it against the reference decoder on every change. It describes a single line. Which lines are table rows depends on the header before them ([section 3.3](#33-tables)), and the rules that ABNF can't express (cell counts, duplicates, conflicts, references) are in the prose.

<!-- grammar:start -->
```abnf
; Flat Notation 1.1: the syntax of a line.
; ABNF (RFC 5234), with %s"..." (RFC 7405) for case-sensitive text.
; Terminals are Unicode code points. A document is split into lines at LF.
; Which lines are table rows is in the specification (section 3.3).
; conformance/grammar.mjs checks every case of the suite against this file.

; Lines
line            = line-body [ CR ]       ; one CR at the end of a line is ignored
line-body       = blank / comment / entry
row-line-comma  = cells-comma [ CR ]     ; the lines after a table header are its rows
row-line-pipe   = cells-pipe [ CR ]
row-line-tab    = cells-tab [ CR ]
row-line-comma-optional = rows-comma [ CR ]   ; rows of a table with optional fields (name?):
row-line-pipe-optional  = rows-pipe [ CR ]    ; a cell may be empty
row-line-tab-optional   = rows-tab [ CR ]

blank           = *sptab
comment         = *sptab "#" *char
entry           = *sptab ( pair / inline / header / reference )

; Entries
pair            = [ lead ] ":" value
inline          = [ lead ] "[" "]" ":" cells-comma
                / [ lead ] "[" "|" "]" ":" cells-pipe
                / [ lead ] "[" HTAB "]" ":" cells-tab
header          = header-comma / header-pipe / header-tab
header-comma    = [ lead ] "[" count "]" "{" field *( "," field ) "}" ":" *ws
header-pipe     = [ lead ] "[" count "|" "]" "{" field *( "|" field ) "}" ":" *ws
header-tab      = [ lead ] "[" count HTAB "]" "{" field *( HTAB field ) "}" ":" *ws
reference       = path *SP "=" *SP ( target / "~" ) *SP   ; never a "." path

; Paths
lead            = path / "." key *( "." key / index )  ; "." goes on with the last [+] item
path            = ( key / index ) *( "." key / index )
target          = ( key / number-index ) *( "." key / number-index )
key             = bare-key / string
bare-key        = 1*( ALPHA / DIGIT / "_" / "$" / "-" )
index           = number-index / "[+]"                 ; [+] is the next element
number-index    = "[" 1*DIGIT "]"
count           = 1*DIGIT
field           = *SP key *( "." key ) [ "?" ] *SP     ; "?" makes the field optional

; Values: one token, with the whitespace around it ignored
value           = *ws scalar *ws
scalar          = literal / number / string / text   ; the first that matches the whole token wins
literal         = %s"null" / %s"true" / %s"false" / "{}" / "[]"
number          = [ "-" ] ( "0" / %x31-39 *DIGIT ) [ "." 1*DIGIT ] [ "e" [ "+" / "-" ] 1*DIGIT ]   ; "e" or "E"
text            = text-start [ *char nonws ]         ; any other token is that text, as a string

; Strings: exactly JSON's (RFC 8259)
string          = DQUOTE *( unescaped / escape ) DQUOTE
unescaped       = %x20-21 / %x23-5B / %x5D-10FFFF
escape          = "\" ( DQUOTE / "\" / "/" / %s"b" / %s"f" / %s"n" / %s"r" / %s"t" / %s"u" 4HEXDIG )

; Cells: inline arrays and table rows. The delimiter splits the cells outside strings, and each cell is a
; value. Before a string, only spaces and tabs may appear, and after it only spaces and tabs and the delimiter.
cells-comma     = cell-comma *( "," cell-comma )
cell-comma      = *sptab string *sptab
                / *sptab ws-other *ws ( string-no-comma / text-no-comma ) *ws
                / *sptab text-no-comma *ws
cells-pipe      = cell-pipe *( "|" cell-pipe )
cell-pipe       = *sptab string *sptab
                / *sptab ws-other *ws ( string-no-pipe / text-no-pipe ) *ws
                / *sptab text-no-pipe *ws
cells-tab       = cell-tab *( HTAB cell-tab )        ; a tab separates cells, so it is not whitespace here
rows-comma      = ( cell-comma / *ws ) *( "," ( cell-comma / *ws ) )
rows-pipe       = ( cell-pipe / *ws ) *( "|" ( cell-pipe / *ws ) )
rows-tab        = ( cell-tab / *ws-no-tab ) *( HTAB ( cell-tab / *ws-no-tab ) )
cell-tab        = *SP string *SP
                / *SP ws-other *ws-no-tab ( string / text-no-tab ) *ws-no-tab
                / *SP text-no-tab *ws-no-tab

string-no-comma = DQUOTE *( %x20-21 / %x23-2B / %x2D-5B / %x5D-10FFFF / escape ) DQUOTE
string-no-pipe  = DQUOTE *( %x20-21 / %x23-5B / %x5D-7B / %x7D-10FFFF / escape ) DQUOTE
text-no-comma   = text-start-no-comma [ *( %x00-09 / %x0B-2B / %x2D-10FFFF ) nonws-no-comma ]
text-no-pipe    = text-start-no-pipe [ *( %x00-09 / %x0B-7B / %x7D-10FFFF ) nonws-no-pipe ]
text-no-tab     = text-start [ *( %x00-08 / %x0B-10FFFF ) nonws ]

; Characters
char            = %x00-09 / %x0B-10FFFF  ; anything but LF
sptab           = SP / HTAB
ws              = SP / HTAB / ws-other   ; what JavaScript's String.prototype.trim removes
ws-no-tab       = SP / ws-other
ws-other        = %x0B-0D / %xA0 / %x1680 / %x2000-200A / %x2028-2029 / %x202F / %x205F / %x3000 / %xFEFF
nonws           = ctl / %x21-7E / high
text-start      = ctl / %x21 / %x23-7E / high                  ; not whitespace, not a quote
text-start-no-comma = ctl / %x21 / %x23-2B / %x2D-7E / high
text-start-no-pipe  = ctl / %x21 / %x23-7B / %x7D-7E / high
nonws-no-comma  = ctl / %x21-2B / %x2D-7E / high
nonws-no-pipe   = ctl / %x21-7B / %x7D-7E / high
ctl             = %x00-08 / %x0E-1F      ; control characters that aren't whitespace (LF is never in a line)
high            = %x7F-9F / %xA1-167F / %x1681-1FFF / %x200B-2027 / %x202A-202E / %x2030-205E
                / %x2060-2FFF / %x3001-FEFE / %xFF00-10FFFF   ; everything above ASCII that isn't whitespace
```
<!-- grammar:end -->

## Appendix B. Whitespace

Whitespace is exactly what JavaScript's `String.prototype.trim` removes (ECMAScript's WhiteSpace and LineTerminator), and what [section 5](#5-values) trims from values and cells and [section 12.3](#123-strings) quotes for:

| Code points | Names |
| --- | --- |
| U+0009, U+000B, U+000C, U+0020 | tab, vertical tab, form feed, space |
| U+000A, U+000D, U+2028, U+2029 | line feed, carriage return, line and paragraph separator |
| U+00A0, U+FEFF | no-break space, zero width no-break space (byte order mark) |
| U+1680, U+2000 to U+200A, U+202F, U+205F, U+3000 | the other space separators (Unicode category Zs) |

Not whitespace: U+0085 (next line), U+180E (Mongolian vowel separator, Zs before Unicode 6.3) and U+200B (zero width space). Many languages' own `trim` or `strip` uses a different set, so implementations SHOULD use this list.

## Appendix C. Number formatting

This is ECMAScript's `Number::toString(x)` for base 10, which [section 12.6](#126-numbers) uses for doubles:

1. If x is NaN or infinite, the encoder writes `null` (this function isn't used).
2. If x is zero (positive or negative), the result is `0`.
3. If x is negative, the result is `-` followed by the result for −x.
4. Let k, s and n be integers such that k ≥ 1, 10^(k−1) ≤ s < 10^k, s × 10^(n−k) is x as a double, and k is as small as possible: s is the **shortest** run of digits that reads back as x. (If several such s exist, use the one for which s × 10^(n−k) is closest to x. If two are equally close, use the even one.) These are the digits of the shortest round-trip representation that most languages provide (Python's `repr`, Go's `strconv.FormatFloat(x, 'g', -1, 64)`, Rust's `{}` and `ryu`).
5. If k ≤ n ≤ 21: the k digits of s, then n − k zeros. (`100`, `123456789012345680000`)
6. If 0 < n ≤ 21: the first n digits of s, `.`, and the remaining k − n digits. (`1.5`, `123.456`)
7. If −6 < n ≤ 0: `0.`, then −n zeros, then the k digits of s. (`0.001`, `0.000001`)
8. Otherwise, with e = n − 1: if k = 1, the digit of s; otherwise the first digit, `.` and the remaining k − 1 digits; then `e`, then `+` if e > 0 or `-` if e < 0, then the decimal digits of |e|. (`1e+21`, `1.5e-7`, `5e-324`)

## Appendix D. Messages

Every reason a decoder reports, with its column and its lenient repair. `F`, `C`, `N`, `R`, `i` and `n` are decimal numbers ([section 12.6](#126-numbers)), `k` is a key as it is, `x` is the text between brackets, `d` is the delimiter (`\t` for HTAB), and `T` is a target path. A dash in the repair column means it is an error in lenient mode too.

| Reason | Column | Lenient repair |
| --- | --- | --- |
| **Paths** | | |
| `Expected ':' after path` | where the path stops | – |
| `Expected ':' after the table header` | where the header stops (only when nothing but whitespace follows) | `read as a table anyway` |
| `Expected '.' or ':' before key` | the key that follows another segment directly | – |
| `Expected a key after '.'` | the code point after the `.` (also at the start of a `.` line) | – |
| `A '.' path needs a [+] item before it` | the `.` | – |
| `Unclosed '['` | the `[` | – |
| `Invalid index '[x]'` | the `[` | – |
| `A delimiter mark is only allowed on inline arrays and tables` | the `]` | – |
| `Unterminated quoted key` | the opening `"` | – |
| `Invalid quoted key` | the opening `"` | – |
| `Expected a field name` | where a field should start | – |
| `Expected 'd' or '}' in table header` | the unexpected code point | – |
| **Values** | | |
| `Missing value` | after the colon (pair), or where the cell starts | `read as null` |
| `Invalid quoted string` | after the colon (pair), or where the cell starts | `kept as text` |
| `Unterminated string` | the opening `"` of the cell | `kept as text` |
| `Expected delimiter after quoted string` | the first code point after the string and its spaces | `the text after it is dropped` |
| `Table rows go on the following lines` | after the header's colon | `the text after the header is ignored` |
| **Building the value** (column 1) | | |
| `Duplicate key 'k'` | 1 | `the last value is kept` |
| `Duplicate index [i]` | 1 | `the last value is kept` |
| `Index [i] skips [n]` | 1 | `the gap is filled with null` |
| `Index [i] is too far past [n]` | 1 | – (lenient only: in strict mode the gap is `skips`) |
| `Path conflict at 'k'`, `Path conflict at [i]` | 1 | – |
| `Expected F values, got C` | 1 | `the missing values are null` / `the extra values are dropped` |
| `Expected N rows, got R` | 1, on the header's line | `the table has the rows that are there` |
| **References** | | |
| `References need { refs: true }` | the `=` | `the line is skipped` |
| `The root can't be a reference` | the `=` | – |
| `Expected a path or '~' after '='` | the first code point after `=` and its spaces | – |
| `Unexpected text after reference` | the first code point after the target and its spaces | – |
| `A reference can't start with '.'` | the `.` | – |
| `Reference target 'T' doesn't exist` | 1 | `read as null` |
| `Reference target 'T' isn't an object or array` | 1 | `read as null` |
| `Reference target 'T' is a reference that comes later` | 1 | `read as null` |

"After the colon" is the column just after the `:`, before any whitespace. "Where the cell starts" is after the SP and HTAB that step 1 of [section 5.2](#52-cells) skips.

With skipped lines ([section 10](#10-lenient-decoding)), an error on a line becomes the warning `reason: the line is skipped`, and an error assigning a table becomes `reason: the table is dropped`.

## Appendix E. Notes on the reference implementations

These are where `@flattype/core` (JavaScript) departs from this document because of its platform. The conformance suite avoids these cases.

- **Columns** count UTF-16 code units, as JavaScript strings do. They differ from code points only after a character outside the Basic Multilingual Plane, such as an emoji, earlier on the same line. The Python package counts code points.
- **Integers** beyond 2^53 are rounded to the nearest double unless `{ bigint: true }` is set, as `JSON.parse` rounds them ([section 7](#7-numbers) allows this). The Python package is always exact.
- **Key order:** JavaScript objects list integer-like keys first, in numeric order ([section 6.2](#62-keys) allows this).
- **Encoding non-JSON values:** both packages follow their platform's JSON conventions (`toJSON` and a `replacer` in JavaScript; `default=` in Python), which this specification leaves to implementations.

## Appendix F. Changes

**1.1** (17 October 2026) adds two ways to write lists whose objects don't all have the same keys, which 1.0 could only write with an index on every line:

- **Optional table fields** ([section 3.3](#33-tables), [12.5](#125-tables)): `{id,phone?}`, and an empty cell for a key a row lacks.
- **Items** ([section 3.4](#34-items), [12.1](#121-document)): `[+]` for the next element, and `.` lines that continue it.
- **The `target` encoder option** ([section 12.7](#127-options)) writes 1.0, and the versioning rules ([section 15](#15-versioning)) now say that the canonical form may change in a minor version, while 1.0 text stays available.
- **New messages:** `A '.' path needs a [+] item before it` and `A reference can't start with '.'`.

Every 1.0 document means the same in 1.1. On the benchmark lists whose objects have different keys, the 1.1 canonical form is 12% to 50% smaller than 1.0's, and 43% to 54% smaller after gzip.

**1.0** (17 October 2026): [the first version](https://github.com/karammm/flattype/blob/spec-v1.0/spec/SPEC.md).
