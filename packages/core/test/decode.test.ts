import { describe, expect, it } from "vitest";
import { FlatDecodeError, decode } from "../src/index.js";

describe("decode", () => {
  it("reads key: value lines with typed scalars", () => {
    expect(decode("name: John\nage: 30\nok: true\nnone: null\ncity: New York")).toEqual({
      name: "John",
      age: 30,
      ok: true,
      none: null,
      city: "New York",
    });
  });

  it("rebuilds nested objects, arrays and tables", () => {
    const text = [
      "user.name: John",
      "user.tags[]: a, b",
      "users[2]{id,profile.name}:",
      "  1, Alice",
      "  2, Bob",
      "list[0].x: 1",
      "list[1]: 2",
    ].join("\n");
    expect(decode(text)).toEqual({
      user: { name: "John", tags: ["a", "b"] },
      users: [
        { id: 1, profile: { name: "Alice" } },
        { id: 2, profile: { name: "Bob" } },
      ],
      list: [{ x: 1 }, 2],
    });
  });

  it("ignores blank lines, # comments and CRLF", () => {
    expect(decode("# header\r\n\r\na: 1\r\n  # indented comment\r\nb: x\r\n")).toEqual({ a: 1, b: "x" });
  });

  it("keeps bare strings that only look a bit like numbers", () => {
    expect(decode("v: 1.0.0\nz: 007\nh: #tag")).toEqual({ v: "1.0.0", z: "007", h: "#tag" });
  });

  it("decodes empty input as an empty object", () => {
    expect(decode("")).toEqual({});
    expect(decode("\n# nothing\n")).toEqual({});
  });

  it("does not touch the prototype for __proto__ keys", () => {
    const out = decode('__proto__.polluted: 1\n"constructor": x') as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.keys(out)).toEqual(["__proto__", "constructor"]);
  });

  describe("strict errors with line and column", () => {
    const cases: Array<[string, RegExp]> = [
      ["a 1", /Expected ':'/],
      ["a:", /Missing value/],
      ["a: 1\na: 2", /Duplicate key/],
      ["a: 1\na.b: 2", /Path conflict/],
      ["a[1]: x", /skips/],
      ['a: "unterminated', /Invalid quoted string/],
      ["t[2]{a,b}:\n  1, 2", /Expected 2 rows/],
      ["t[1]{a,b}:\n  1", /Expected 2 values/],
      ["t[]: a,, b", /Missing value/],
      ["a.: 1", /Expected a key/],
      ["a[x]: 1", /Invalid index/],
    ];
    for (const [text, msg] of cases) {
      it(JSON.stringify(text), () => {
        expect(() => decode(text)).toThrow(msg);
        try {
          decode(text);
        } catch (e) {
          expect(e).toBeInstanceOf(FlatDecodeError);
          expect((e as FlatDecodeError).line).toBeGreaterThan(0);
        }
      });
    }
  });

  it("recovers from malformed input when strict is off", () => {
    expect(decode("a:\nb: 1\nb: 2\nc[2]: x\nt[3]{x,y}:\n  1", { strict: false })).toEqual({
      a: null,
      b: 2,
      c: [null, null, "x"],
      t: [{ x: 1, y: null }],
    });
  });
});
