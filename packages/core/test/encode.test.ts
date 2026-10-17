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

  it("writes mixed arrays item by item, with [+]", () => {
    expect(encode({ a: [{ x: 1 }, { y: 2 }, 3] })).toBe("a[+].x: 1\na[+].y: 2\na[+]: 3");
    expect(encode({ a: [[1, 2], []] })).toBe("a[+][]: 1, 2\na[+]: []");
    expect(encode({ a: [{ x: 1, k: [{ p: 1 }, 2] }, { y: 2 }] })).toBe("a[+].x: 1\n.k[0].p: 1\n.k[1]: 2\na[+].y: 2");
    // An array of arrays goes on with an index, so it keeps its indexes.
    expect(encode([[1, { a: 1 }], 2])).toBe("[0][0]: 1\n[0][1].a: 1\n[+]: 2");
  });

  it("writes tables whose rows have different keys, with optional fields", () => {
    const users = [{ id: 1, name: "Ann", phone: "555" }, { id: 2, name: "Bo" }, { id: 3, address: { city: "Paris" }, name: "Cy" }];
    const text = encode({ users });
    expect(text).toBe('users[3]{id,address.city?,name,phone?}:\n  1, , Ann, "555"\n  2, , Bo,\n  3, Paris, Cy,');
    expect(decode(text)).toEqual({ users });
    expect(encode({ u: [{ id: 1, a: 1 }, { id: 2 }] }, { delimiter: "|" })).toBe("u[2|]{id|a?}:\n  1 | 1\n  2 |");
  });

  it("only makes a table when the keys fit one header", () => {
    // No key in every row, keys in different orders, a key inside another, or a header too wide: [+] items.
    expect(encode([{ a: 1 }, { b: 2 }])).toBe("[+].a: 1\n[+].b: 2");
    expect(encode([{ id: 1, a: 1, b: 2 }, { id: 2, b: 3, a: 4 }])).toBe("[+].id: 1\n.a: 1\n.b: 2\n[+].id: 2\n.b: 3\n.a: 4");
    expect(encode([{ id: 1, a: 1 }, { id: 2, a: { b: 1 } }])).toBe("[+].id: 1\n.a: 1\n[+].id: 2\n.a.b: 1");
    // Five keys for rows of two: more than twice as wide.
    expect(encode([{ id: 1, a: 1 }, { id: 2, b: 1 }, { id: 3, c: 1 }, { id: 4, d: 1 }])).toBe(
      "[+].id: 1\n.a: 1\n[+].id: 2\n.b: 1\n[+].id: 3\n.c: 1\n[+].id: 4\n.d: 1",
    );
    expect(encode([{ id: 1, a: 1 }, { id: 2, b: 1 }, { id: 3, c: 1 }])).toBe("[3]{id,a?,b?,c?}:\n  1, 1, ,\n  2, , 1,\n  3, , , 1");
    // New keys go at the end, or before the next key of their row.
    expect(encode([{ id: 1 }, { id: 2, a: 1 }, { id: 3, b: 1 }])).toBe("[3]{id,a?,b?}:\n  1, ,\n  2, 1,\n  3, , 1");
    expect(encode([{ id: 1, z: 1 }, { id: 2, a: 1, z: 2 }])).toBe("[2]{id,a?,z}:\n  1, , 1\n  2, 1, 2");
  });

  it("writes 1.0 text with target 1.0", () => {
    expect(encode({ a: [{ x: 1 }, { y: 2 }, 3] }, { target: "1.0" })).toBe("a[0].x: 1\na[1].y: 2\na[2]: 3");
    expect(encode([{ id: 1, a: 1 }, { id: 2 }], { target: "1.0" })).toBe("[0].id: 1\n[0].a: 1\n[1].id: 2");
  });

  it("can turn tables off", () => {
    expect(encode([{ a: 1 }, { a: 2 }], { tabular: "off" })).toBe("[+].a: 1\n[+].a: 2");
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

  it("rejects circular structures and undefined roots", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(() => encode(a)).toThrow(/circular/);
    const b: Record<string, unknown> = { x: 1 };
    b.inner = { b };
    expect(() => encode([b, b])).toThrow(/circular/);
    expect(() => encode(undefined)).toThrow(TypeError);
  });

  it("writes a BigInt as its digits, in values, inline arrays and tables", () => {
    const id = 2n ** 64n + 1n;
    expect(encode({ id, small: 5n, neg: -id })).toBe("id: 18446744073709551617\nsmall: 5\nneg: -18446744073709551617");
    expect(encode({ ids: [id, 1n] })).toBe("ids[]: 18446744073709551617, 1");
    expect(encode({ users: [{ id }, { id: 2n }] })).toBe("users[2]{id}:\n  18446744073709551617\n  2");
  });

  it("allows the same object twice when it is not a cycle", () => {
    const shared = { id: 1 };
    expect(encode({ a: shared, b: shared })).toBe("a.id: 1\nb.id: 1");
  });
});
