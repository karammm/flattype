import { describe, expect, it } from "vitest";
import { decode, encode } from "../src/index.js";
import { parseJson, replaceTypes, reviveDates, stringifyJson } from "../src/types.js";

// JSON.parse source text access (Node 21+).
const hasSource = (() => {
  let seen = false;
  JSON.parse("1", (_k, v, ctx?: { source?: string }) => ((seen = ctx?.source === "1"), v));
  return seen;
})();

describe("replaceTypes", () => {
  it("writes Map, Set, bytes and errors as plain data", () => {
    const value = {
      tags: new Set(["a", "b"]),
      byName: new Map([["alice", 1]]),
      byId: new Map([[1, "alice"]]),
      avatar: new Uint8Array([104, 105, 255]),
      buffer: Buffer.from("hi"),
      raw: new Uint8Array([1, 2]).buffer,
      floats: new Float64Array([1.5, 2]),
      error: new TypeError("boom"),
      when: new Date("2026-01-01T09:00:00Z"),
      id: 2n ** 64n,
    };
    expect(encode(value, { replacer: replaceTypes })).toBe(
      [
        "tags[]: a, b",
        "byName.alice: 1",
        "byId[+][]: 1, alice",
        "avatar: aGn/",
        "buffer: aGk=",
        "raw: AQI=",
        "floats[]: 1.5, 2",
        "error.name: TypeError",
        "error.message: boom",
        "when: 2026-01-01T09:00:00.000Z",
        "id: 18446744073709551616",
      ].join("\n"),
    );
  });

  it("works at the root, in tables and with JSON.stringify", () => {
    expect(encode(new Set([1, 2]), { replacer: replaceTypes })).toBe("[]: 1, 2");
    expect(encode([{ k: new Map([["x", 1]]) }, { k: new Map([["x", 2]]) }], { replacer: replaceTypes })).toBe("[2]{k.x}:\n  1\n  2");
    expect(JSON.stringify({ s: new Set([1]), b: new Uint8Array([0]) }, replaceTypes)).toBe('{"s":[1],"b":"AA=="}');
  });

  it("encodes large byte arrays", () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(encode({ b: bytes }, { replacer: replaceTypes })).toBe("b: " + Buffer.from(bytes).toString("base64"));
  });
});

describe("reviveDates", () => {
  it("turns date-times with a zone into Dates", () => {
    const text = encode({
      js: "2026-01-01T09:00:00.000Z",
      python: "2026-01-01T09:00:00.123456+00:00",
      offset: "2026-01-01T10:00+01:00",
      dateOnly: "2026-01-01",
      noZone: "2026-01-01T09:00:00",
      invalid: "2026-13-45T99:00:00Z",
      text: "hello",
    });
    expect(decode(text, { reviver: reviveDates })).toEqual({
      js: new Date("2026-01-01T09:00:00.000Z"),
      python: new Date("2026-01-01T09:00:00.123Z"),
      offset: new Date("2026-01-01T09:00:00.000Z"),
      dateOnly: "2026-01-01",
      noZone: "2026-01-01T09:00:00",
      invalid: "2026-13-45T99:00:00Z",
      text: "hello",
    });
  });
});

describe("exact JSON", () => {
  it("stringifyJson writes BigInts as digits", () => {
    expect(stringifyJson({ id: 2n ** 64n, ids: [1n, -5n], s: "x" })).toBe('{"id":18446744073709551616,"ids":[1,-5],"s":"x"}');
    expect(stringifyJson({ a: 1 }, 2)).toBe('{\n  "a": 1\n}');
    expect(stringifyJson({ s: "\u0001flattype-bigint-" })).toBe('{"s":"\\u0001flattype-bigint-"}');
  });

  it.runIf(hasSource)("parseJson reads big integers exactly", () => {
    expect(parseJson('{"id":18446744073709551617,"n":5,"f":1e30,"x":12345678901234567890.5}')).toEqual({
      id: 18446744073709551617n,
      n: 5,
      f: 1e30,
      x: 12345678901234567890.5,
    });
    const id = 2n ** 70n + 3n;
    expect(parseJson(stringifyJson({ id }))).toEqual({ id });
  });

  it.skipIf(hasSource)("parseJson falls back to JSON.parse on older engines", () => {
    expect(parseJson('{"id":18446744073709551617}')).toEqual({ id: 18446744073709552000 });
  });
});
