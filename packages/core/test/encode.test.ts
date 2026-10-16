import { describe, expect, it } from "vitest";
import { decode, encode } from "../src/index.js";

describe("encode", () => {
  it("writes a flat object as key: value lines", () => {
    expect(encode({ name: "John", age: 30, city: "New York" })).toBe("name: John\nage: 30\ncity: New York");
  });

  it("flattens nested objects into dot paths", () => {
    expect(encode({ user: { address: { zip: "10001", city: "NYC" } } })).toBe(
      'user.address.zip: "10001"\nuser.address.city: NYC',
    );
  });

  it("writes primitive arrays inline", () => {
    expect(encode({ tags: ["admin", "editor", 3, null] })).toBe("tags[]: admin, editor, 3, null");
  });

  it("writes arrays of same-shaped objects as a table", () => {
    const users = [
      { id: 1, name: "Alice", role: { title: "Admin" } },
      { id: 2, name: "Bob", role: { title: "Dev" } },
    ];
    expect(encode({ users })).toBe("users[2]{id,name,role.title}:\n  1, Alice, Admin\n  2, Bob, Dev");
  });

  it("falls back to indexed paths for mixed arrays", () => {
    expect(encode({ a: [{ x: 1 }, { y: 2 }, 3] })).toBe("a[0].x: 1\na[1].y: 2\na[2]: 3");
    expect(encode({ a: [[1, 2], []] })).toBe("a[0][]: 1, 2\na[1]: []");
  });

  it("can turn tables off", () => {
    expect(encode([{ a: 1 }, { a: 2 }], { tabular: "off" })).toBe("[0].a: 1\n[1].a: 2");
  });

  it("encodes roots that are not objects", () => {
    expect(encode({})).toBe("");
    expect(encode(42)).toBe(": 42");
    expect(encode([])).toBe(": []");
    expect(encode(["a", "b"])).toBe("[]: a, b");
    expect(encode([{ id: 1 }])).toBe("[1]{id}:\n  1");
  });

  it("quotes strings that would otherwise read as something else", () => {
    const s = encode({ a: "30", b: "true", c: "", d: " pad", e: "x\ny", f: '"q', g: "null", h: "{}" });
    expect(s).toBe('a: "30"\nb: "true"\nc: ""\nd: " pad"\ne: "x\\ny"\nf: "\\"q"\ng: "null"\nh: "{}"');
  });

  it("leaves colons, commas and hashes bare in plain values", () => {
    expect(encode({ url: "http://x.io/a#b", note: "a, b" })).toBe("url: http://x.io/a#b\nnote: a, b");
  });

  it("quotes cells that contain the delimiter", () => {
    expect(encode({ t: ["a, b", "c"] })).toBe('t[]: "a, b", c');
    expect(encode({ t: ["a|b", "a, b"] }, { delimiter: "|" })).toBe('t[|]: "a|b" | a, b');
  });

  it("quotes keys that are not plain identifiers", () => {
    expect(encode({ "first name": "J", "a.b": 1, "@type": "x" })).toBe('"first name": J\n"a.b": 1\n"@type": x');
  });

  it("follows JSON.stringify for dates, undefined, NaN and functions", () => {
    const d = new Date("2026-01-02T03:04:05.000Z");
    expect(encode({ d, u: undefined, f: () => 1, n: NaN, arr: [undefined, Infinity] })).toBe(
      "d: 2026-01-02T03:04:05.000Z\nn: null\narr[]: null, null",
    );
  });

  it("supports tab and pipe delimiters and custom indent", () => {
    const rows = [{ a: 1, b: "x" }, { a: 2, b: "y" }];
    expect(encode(rows, { delimiter: "\t", indent: 1 })).toBe("[2\t]{a\tb}:\n 1\tx\n 2\ty");
    expect(decode(encode(rows, { delimiter: "\t" }))).toEqual(rows);
    expect(decode(encode(rows, { delimiter: "|" }))).toEqual(rows);
  });

  it("rejects circular structures, BigInt and undefined roots", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => encode(a)).toThrow(/circular/);
    const b: Record<string, unknown> = { x: 1 };
    b.inner = { b };
    expect(() => encode([b, b])).toThrow(/circular/);
    expect(() => encode({ n: 1n })).toThrow(/BigInt/);
    expect(() => encode(undefined)).toThrow(TypeError);
  });

  it("allows the same object twice when it is not a cycle", () => {
    const shared = { id: 1 };
    expect(encode({ a: shared, b: shared })).toBe("a.id: 1\nb.id: 1");
  });
});
