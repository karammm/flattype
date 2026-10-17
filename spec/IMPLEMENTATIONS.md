# Implementations

These implementations of [Flat Notation 1.0](SPEC.md) pass the [conformance suite](../conformance/README.md) at the levels shown. CI checks every row marked "CI" on each change.

| Language | Package | Decoder | Encoder | Exact integers | Lenient | References | Messages | Checked |
| --- | --- | :---: | :---: | :---: | :---: | :---: | :---: | --- |
| JavaScript, TypeScript | [`@flattype/core`](https://www.npmjs.com/package/@flattype/core) | ✓ | ✓ | ✓ ¹ | ✓ | ✓ | ✓ | CI |
| Python | [`flattype`](https://pypi.org/project/flattype/) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | CI |

¹ With `decode(text, { bigint: true })`. By default, integers beyond 2⁵³ round, as with `JSON.parse`.

Both also pass the Unpaired surrogates level, and both stream, with `createDecoder` and `flattype.Decoder`.

## Add yours

Wrote an implementation in another language? It can be listed here, whoever maintains it:

1. Make the suite pass at the levels you want to claim: `node conformance/run.mjs -- <your adapter>` (see [writing a port](PORTING.md#5-testing)).
2. Open an issue with the [**List my implementation**](https://github.com/karammm/flattype/issues/new?template=implementation.yml) template, and paste the runner's output.

A listed implementation keeps its row while it keeps passing. When the spec gets a new minor version, its row shows the version it was checked against.
