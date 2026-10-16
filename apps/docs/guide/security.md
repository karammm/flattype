# Security

FlatType decodes text that can come from anywhere: API responses, files, and replies written by a language model. This page lists what the decoder guarantees and how each guarantee is tested.

## Guarantees

| Guarantee | How it is enforced |
| --- | --- |
| **No code execution.** There is no `eval`, `Function` or dynamic import; values are only ever data | Code review, and the decoder imports nothing but its own modules |
| **No prototype pollution.** Keys such as `__proto__`, `constructor` and `prototype` become own properties; nothing is assigned through the prototype chain | Unit tests, plus a fuzz test that decodes random documents full of those keys and checks `Object.prototype` afterwards |
| **Only `FlatDecodeError`.** Malformed input throws one error type, with a line and column, in strict and lenient mode alike | Fuzzing with documents built from the format's own syntax characters |
| **Linear time.** Decoding hostile input (long digit runs, escapes, many cells, deep paths, unclosed quotes, long lines streamed in tiny chunks) grows in proportion to its size | Timing tests check that 8× the input stays far below 64×, which is what a quadratic algorithm would take. The same tests cover model coercion and `fromModelOutput` |
| **Bounded memory in lenient mode.** A skipped index fills at most 1,000 `null` entries, so a short line like `a[999999999]: 1` can't allocate a huge array. A declared table size costs nothing until its rows arrive | Unit tests |
| **References are opt-in.** `path = other.path` lines, which can describe cycles or a graph that is enormous when walked, are rejected unless the caller passes `refs: true` | Unit tests |
| **No stack overflow in revivers.** The `reviver` walk is iterative, visits each shared object once, and stops at cycles | Unit tests and a linear-time test on a 40,000-level document |
| **Same result streamed or whole.** `createDecoder()` gives exactly the value `decode()` does, wherever the chunks split | A fuzz test with random chunk boundaries |
| **Lossless round trip.** `decode(encode(x))` equals `JSON.parse(JSON.stringify(x))` | Property-based tests with every encode option, 50,000 values per option in CI |

The deep fuzzing and the timing tests run in the **hardening** job of [CI](https://github.com/karammm/flattype/actions/workflows/ci.yml) on every push.

## The 1.9 review

The 1.9.0 review of every regular expression and loop that sees untrusted input found and fixed:

- **Lenient memory use:** `a[999999999]: 1` filled a billion-element array. Gaps are now capped at 1,000.
- **Quadratic `fromModelOutput`:** its `<data>` and code-fence extraction was quadratic on text with many openers and no closer. It now uses linear scans.
- **Quadratic model coercion:** the numeric-string check (`"42"` → `42`) backtracked quadratically on long digit runs.
- **Quadratic streaming of long lines:** `createDecoder()` re-split everything it had buffered on every chunk, which was quadratic for one long line arriving in small chunks.
- **Slow `streamRows` batches:** it removed rows one at a time from the front of an array, which was quadratic for large batches.

## References

The 1.10 `refs` option lets a document say that two paths are the same object. That is safe to decode, since FlatType resolves each reference in one step and never copies, but the result is no longer a tree:
- **`JSON.stringify` throws** on a decoded cycle.
- **A recursive walk** (your own, or a library's) loops forever on a cycle. On a chain of objects that each point twice to the one before, it does twice the work per level, so 40 lines can mean 2⁴⁰ visits.

That is why both `encode` and `decode` need `refs: true`, and `flatFetch`, `flatResource`, the framework hooks and `fromModelOutput` never turn it on. Use it for data you produce yourself, such as caching a graph of objects, not for responses from other parties.

## Server-side use

- **`flatExpress()`, `flatFastify` and `flatHono()`** only change responses for clients that ask for `text/x-flat`, and they always send `Vary: Accept`, so shared caches keep the two formats apart.
- **They never parse request bodies.** Request bodies stay whatever your framework already accepts.
- **Limit body sizes as you would for JSON.** Decoding is linear, but a 1 GB document is still a 1 GB document.

## Supply chain

- **Dependencies:** `@flattype/core` has no third-party runtime dependencies. The other packages depend only on `@flattype/*` packages, except `@flattype/cli`, which also uses [`yaml`](https://www.npmjs.com/package/yaml) for YAML specs.
- **Provenance:** every release is built and published by GitHub Actions with [npm provenance](https://docs.npmjs.com/generating-provenance-statements). `npm audit signatures` verifies that a package you installed was built from this repository.
- **Vulnerability scanning:** CI fails on known high or critical vulnerabilities in what users install (`pnpm audit --prod`).

## Reporting a vulnerability

Please report it privately through [GitHub security advisories](https://github.com/karammm/flattype/security/advisories/new), not in a public issue. Include the input that triggers it, if you can.
