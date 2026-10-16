import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Delimiter, EncodeOptions } from "../src/index.js";
import { decode, encode, flatten, unflatten } from "../src/index.js";

const asJson = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

const options: EncodeOptions[] = [
  {},
  { tabular: "off" },
  ...(["|", "\t"] as Delimiter[]).map((delimiter) => ({ delimiter })),
  { indent: 0 },
];

const scalar = fc.oneof(
  fc.string(),
  fc.string({ unit: "grapheme" }),
  fc.constantFrom("", " ", "null", "true", "30", "-1.5e3", "{}", "[]", "a, b", "a|b", "a\tb", "#x", '"', "x: y", "\n"),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);
const key = fc.oneof(fc.string(), fc.constantFrom("id", "__proto__", "a.b", "[0]", "x y", "", "-", "0"));

/** Arrays of same-shaped objects, so the table form gets exercised. */
const table = fc
  .uniqueArray(key, { minLength: 1, maxLength: 4 })
  .chain((keys) =>
    fc.array(
      fc.tuple(...keys.map(() => fc.oneof(scalar, fc.record({ inner: scalar })))).map((vals) =>
        Object.fromEntries(keys.map((k, i) => [k, vals[i]])),
      ),
      { minLength: 1, maxLength: 5 },
    ),
  );

const value = fc.oneof(fc.jsonValue(), fc.dictionary(key, fc.jsonValue()), table, fc.dictionary(key, table));

describe("round trip", () => {
  for (const opts of options) {
    it(`decode(encode(x)) equals x with ${JSON.stringify(opts)}`, () => {
      fc.assert(
        fc.property(value, (v) => {
          expect(decode(encode(v, opts))).toEqual(asJson(v));
        }),
        { numRuns: 1500 },
      );
    });
  }

  it("unflatten(flatten(x)) equals x", () => {
    fc.assert(
      fc.property(value, (v) => {
        expect(unflatten(flatten(v))).toEqual(asJson(v));
      }),
      { numRuns: 1500 },
    );
  });
});
