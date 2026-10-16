import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createDecoder, decode, FlatDecodeError } from "../src/index.js";

const RUNS = Number(process.env.FUZZ_RUNS ?? 1500);

/** Text built from the format's own syntax characters, so the fuzzer reaches the interesting paths. */
const flatish = fc
  .array(
    fc.oneof(
      fc.constantFrom("a", "b.c", "__proto__", "constructor", "prototype", "[0]", "[1]", "[]", "[2]{x,y}", "{", "}", ":", ": ", ", ", "|", "\t", '"', '\\"', "\\", "#", " ", "\n", "\r\n", "null", "true", "1", "-0.5e3", "[", "]", ".", " = ", "=", "~", "a = b", "b = ~"),
      fc.string({ maxLength: 4 }),
    ),
    { maxLength: 40 },
  )
  .map((parts) => parts.join(""));

describe("decoder robustness", () => {
  it("only ever throws FlatDecodeError, strict or lenient", () => {
    fc.assert(
      fc.property(flatish, fc.boolean(), fc.boolean(), fc.boolean(), (text, strict, refs, skipInvalidLines) => {
        try {
          decode(text, { strict, refs, skipInvalidLines });
        } catch (e) {
          if (!(e instanceof FlatDecodeError)) throw e;
        }
      }),
      { numRuns: RUNS * 4 },
    );
  });

  it("never touches Object.prototype", () => {
    fc.assert(
      fc.property(flatish, (text) => {
        try {
          decode(text, { strict: false, refs: true, skipInvalidLines: true });
        } catch {
          // fine
        }
        expect(Object.getOwnPropertyNames(Object.prototype).sort()).toEqual(PROTO_KEYS);
        expect(({} as Record<string, unknown>).a).toBeUndefined();
      }),
      { numRuns: RUNS },
    );
  });

  it("gives the same result in one piece and in random chunks", () => {
    fc.assert(
      fc.property(flatish, fc.array(fc.nat(), { maxLength: 8 }), (text, cuts) => {
        let whole: unknown;
        try {
          whole = decode(text, { strict: false });
        } catch (e) {
          whole = String(e);
        }
        const d = createDecoder({ strict: false });
        let chunked: unknown;
        try {
          let at = 0;
          for (const c of [...cuts].sort((a, b) => a - b)) {
            const end = Math.min(text.length, c % (text.length + 1));
            if (end > at) d.write(text.slice(at, end)), (at = end);
          }
          d.write(text.slice(at));
          chunked = d.end();
        } catch (e) {
          chunked = String(e);
        }
        expect(chunked).toEqual(whole);
      }),
      { numRuns: RUNS },
    );
  });
});

const PROTO_KEYS = Object.getOwnPropertyNames(Object.prototype).sort();

describe("resource limits", () => {
  it("lenient mode fills small index gaps but refuses huge ones", () => {
    expect(decode("a[3]: x", { strict: false })).toEqual({ a: [null, null, null, "x"] });
    expect(() => decode("a[999999999]: 1", { strict: false })).toThrow(/too far past \[0\]/);
    expect(() => decode("a[999999999]: 1")).toThrow(/skips \[0\]/);
  });

  it("a huge declared table size costs nothing until rows arrive", () => {
    expect(decode("t[999999999]{a}:\n  1", { strict: false })).toEqual({ t: [{ a: 1 }] });
  });
});
