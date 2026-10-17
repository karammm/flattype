# Conformance suite

These files check that an implementation of [Flat Notation 1.0](../spec/SPEC.md) reads and writes exactly what the reference implementation does, in any language.

| File | What it is |
| --- | --- |
| [`cases.json`](cases.json) | About 4,500 cases: what to write for a value, and what to read from a text (a value, warnings or an error) |
| [`run.mjs`](run.mjs) | The runner. It sends every case to your implementation and reports each [level](../spec/SPEC.md#14-conformance) |
| [`grammar.mjs`](grammar.mjs) | Checks documents against [`spec/grammar.abnf`](../spec/grammar.abnf) |
| [`adapters/`](adapters) | The adapters for the JavaScript and Python packages, as examples |
| [`cases.schema.json`](cases.schema.json) | The JSON Schema of `cases.json` |
| [`llm.json`](llm.json) | Cases for the language-model helpers of `@flattype/ai` and `flattype.ai`. Not part of the format |

The runner and the grammar checker need Node.js 21 or later, and nothing else: no `npm install`.

## Running it

```console
$ node conformance/run.mjs -- python3 my_adapter.py

Flat Notation 1.0 conformance: python3 my_adapter.py

  Decoder               1613 / 1613   ✓
  Encoder                960 / 960    ✓
  Exact integers         200 / 200    ✓
  Lenient               1306 / 1306   ✓
  References            1446 / 1446   ✓
  Messages              2614 / 2614   ✓
  Unpaired surrogates     60 / 60     ✓

Passes: Decoder, Encoder, Exact integers, Lenient, References, Messages, Unpaired surrogates.
```

Everything after `--` is the command that starts your adapter. Failures are printed under their level, with the document, what was expected and what came back. The exit code is 1 if any case fails.

| Option | |
| --- | --- |
| `--only decoder,encoder` | Run only these levels (messages are checked on the decode cases of the levels that run) |
| `--skip surrogates` | Skip levels, for example where strings can't hold unpaired surrogates (Go, Rust, Swift) |
| `--show 20` | Print up to 20 failures per level (default 3) |
| `--cases file.json` | Use another case file |

The two reference implementations run it in CI:

```sh
node conformance/run.mjs -- node conformance/adapters/javascript.mjs    # after pnpm turbo run build --filter=@flattype/core
node conformance/run.mjs -- uv run --project python python conformance/adapters/python.py
```

## The protocol

The adapter is a small program around your implementation. It reads requests from stdin, one JSON object per line, and writes one JSON object per line to stdout for each, in order, echoing the request's `id`. It should flush after every line. It must read and write integers of any size exactly (most JSON libraries do; JavaScript needs care).

**Decode** a document. Every option is always present:

```json
{"id": 1, "op": "decode", "text": "a: 1\nb[]: x, y", "options": {"strict": true, "refs": false, "skipInvalidLines": false}}
```

Answer with the value and the warnings (an empty list in strict mode), or with the error:

```json
{"id": 1, "value": {"a": 1, "b": ["x", "y"]}, "warnings": []}
{"id": 1, "error": {"message": "Missing value", "line": 1, "column": 3}}
```

Each warning is `{"message": "Missing value: read as null", "line": 1, "column": 3}`. The error's `message` is the reason alone, without the position.

**Encode** a value:

```json
{"id": 2, "op": "encode", "value": {"a": [1, 2]}, "options": {"delimiter": ",", "indent": 2, "tabular": true, "refs": false}}
```

```json
{"id": 2, "text": "a[]: 1, 2"}
```

**Re-encode** a document with references: decode it with references enabled, encode the result with references enabled, and answer with the text. This checks that shared objects come back as the same object, because only then does the encoder write the references again:

```json
{"id": 3, "op": "reencode", "text": "a.x: 1\nb = a", "options": {"refs": true}}
```

```json
{"id": 3, "text": "a.x: 1\nb = a"}
```

Answer `{"id": 4, "unsupported": true}` to any request your implementation can't handle, such as lenient options or references. Those cases are reported as not supported, not as failures.

## What is compared

- **Values** are compared as JSON. Numbers are compared by value, so `30` and `30.0` are equal, and integers of any size digit for digit. Object keys can be in any order.
- **Text** from the encoder is compared byte for byte.
- **Errors and warnings:** the line and column for every level, and the message text for the Messages level.

## The case file

`cases.json` is generated from `@flattype/core` by [`packages/core/test/conformance.test.ts`](../packages/core/test/conformance.test.ts), from handwritten documents and seeded random ones, and CI fails if it is stale. Its four sections are described by [`cases.schema.json`](cases.schema.json):

| Section | Cases | Each case |
| --- | ---: | --- |
| `encode` | 990 | `value`, `options` and the `text` the encoder writes |
| `decode` | 3,255 | `text`, `options`, and the `value` (with `warnings` in lenient mode) or the `error`, as `"reason (line L, column C)"` |
| `refs` | 150 | a `text` with references that re-encodes to itself |
| `bigint` | 100 | a `value` with integers beyond 2⁵³ and its `text` |

The cases only use values every language can hold the same way: finite numbers, no negative zero, and integers within 2⁵³ outside the `bigint` section.

You don't have to use the runner. The Python package, for example, reads `cases.json` straight from its own tests ([`python/tests/test_conformance.py`](../python/tests/test_conformance.py)). The runner is just the shortest way to a result that others can compare.
