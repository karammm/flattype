import { describe, expect, it } from "vitest";
import { FlatDecodeError, createDecoder, decode } from "../src/index.js";

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

describe("createDecoder", () => {
  const text = "page: 1\nusers[3]{id,name}:\n  1, Alice\n  2, Bob\n  3, \"Chen, W\"\nnext: null";

  it("gives the same result as decode for every possible chunk split", () => {
    const expected = decode(text);
    for (let size = 1; size <= text.length; size++) {
      const d = createDecoder();
      for (let i = 0; i < text.length; i += size) d.write(text.slice(i, i + size));
      expect(d.end()).toEqual(expected);
    }
  });

  it("emits rows as soon as their line is complete", () => {
    const seen: string[] = [];
    const d = createDecoder({ onRow: (r) => seen.push(`${r.path}#${r.index}:${JSON.stringify(r.value)}`) });
    d.write("page: 1\nusers[3]{id,name}:\n  1, Alice\n  2, B");
    expect(seen).toEqual(['users#0:{"id":1,"name":"Alice"}']);
    d.write("ob\n  3, \"Chen, W\"\n");
    expect(seen).toHaveLength(3);
    d.end();
  });

  it("names nested and root tables by path", () => {
    const paths: string[] = [];
    const d = createDecoder({ onRow: (r) => paths.push(r.path) });
    d.write('a.b[1]{x}:\n  1\n"my list"[0][1]{x}:\n  2\n[1]{x}:\n  3');
    expect(() => d.end()).toThrow(); // root table after keys is a path conflict
    expect(paths).toEqual(["a.b", '"my list"[0]', ""]);
  });

  it("can drop rows after emitting them", () => {
    let count = 0;
    const d = createDecoder({ keepRows: false, onRow: () => count++ });
    d.write(text);
    expect(d.end()).toEqual({ page: 1, users: [], next: null });
    expect(count).toBe(3);
  });

  it("reports a table cut short at the end", () => {
    const d = createDecoder();
    d.write("t[2]{a}:\n  1");
    expect(() => d.end()).toThrow(/Expected 2 rows, got 1/);
  });
});
