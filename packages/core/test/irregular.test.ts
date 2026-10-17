import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Delimiter, FlatWarning } from "../src/index.js";
import { createDecoder, decode, encode, FlatDecodeError } from "../src/index.js";
import { asJson } from "./json.js";

/** Flat Notation 1.1: tables with optional fields, `[+]` items and `.` lines. */
const RUNS = Number(process.env.FUZZ_RUNS ?? 1500);

const error = (text: string, options = {}): string => {
  try {
    decode(text, options);
  } catch (e) {
    if (e instanceof FlatDecodeError) return e.message;
    throw e;
  }
  return "no error";
};

describe("[+] items and . lines", () => {
  it("appends items and continues them", () => {
    expect(decode("e[+].type: push\n.repo: r1\n.commits[1]{sha}:\n  a1\ne[+].type: star\n.user.login: u")).toEqual({
      e: [{ type: "push", repo: "r1", commits: [{ sha: "a1" }] }, { type: "star", user: { login: "u" } }],
    });
    expect(decode("[+]: 1\n[+][]: 2, 3\n[+]: {}")).toEqual([1, [2, 3], {}]);
    expect(decode("a[0]: x\na[+]: y\na[+][+]: z")).toEqual({ a: ["x", "y", ["z"]] });
  });

  it("works with every entry kind, blank lines and comments", () => {
    const text = "l[+].id: 1\n\n# note\n.tags[]: a, b\n.t[1]{x}:\n  1\n.\"q k\": 2\nl[+] = l[0]";
    const v = decode(text, { refs: true }) as { l: Record<string, unknown>[] };
    expect(v.l[0]).toEqual({ id: 1, tags: ["a", "b"], t: [{ x: 1 }], "q k": 2 });
    expect(v.l[1]).toBe(v.l[0]);
    // A reference is always a whole path: the encoder writes indexes for an item that holds one.
    expect(error("l[+].id: 1\n.self = ~", { refs: true })).toBe("A reference can't start with '.' (line 2, column 1)");
    const graph: Record<string, unknown> = { id: 1 };
    graph.self = graph;
    expect(encode({ l: [graph, { id: 2 }] }, { refs: true })).toBe("l[0].id: 1\nl[0].self = l[0]\nl[+].id: 2");
  });

  it("ends the item at any other line", () => {
    expect(error("a[+].x: 1\nb: 2\n.y: 3")).toBe("A '.' path needs a [+] item before it (line 3, column 1)");
    expect(error(".x: 1")).toBe("A '.' path needs a [+] item before it (line 1, column 1)");
    expect(error("a[+].x: 1\n  .[0]: 1")).toBe("Expected a key after '.' (line 2, column 4)");
    expect(error("a[+].x: 1\n.x: 2")).toBe("Duplicate key 'x' (line 2, column 1)");
    // The deepest [+] is the item: a nested [+] moves into it.
    expect(decode("a[+].k[+].x: 1\n.y: 2")).toEqual({ a: [{ k: [{ x: 1, y: 2 }] }] });
  });

  it("keeps [+] out of reference targets and unflatten", () => {
    expect(error("a[+].x: 1\nb = a[+]", { refs: true })).toBe("Expected a path or '~' after '=' (line 2, column 5)");
    expect(error("a[0]: 1\nb = .x", { refs: true })).toBe("Expected a path or '~' after '=' (line 2, column 5)");
    expect(error("a[+]{x}: 1")).toBe("Expected ':' after path (line 1, column 5)");
  });

  it("leaves the item alone when a line is skipped", () => {
    const warnings: FlatWarning[] = [];
    const v = decode("a[+].x: 1\nb = a\n.y: 2\nnot a line\n.z: 3", { strict: false, skipInvalidLines: true, onWarning: (w) => warnings.push(w) });
    expect(v).toEqual({ a: [{ x: 1, y: 2, z: 3 }] });
    expect(warnings.map((w) => w.line)).toEqual([2, 4]);
  });
});

describe("optional table fields", () => {
  it("leaves out the keys of empty cells", () => {
    expect(decode('u[3]{id,name?,phone?}:\n  1, Ann, "555"\n  2, ,\n  3, "", null')).toEqual({
      u: [{ id: 1, name: "Ann", phone: "555" }, { id: 2 }, { id: 3, name: "", phone: null }],
    });
    expect(decode("u[2|]{id|a.b?|a.c?}:\n  1 |  | 2\n  2 | |")).toEqual({ u: [{ id: 1, a: { c: 2 } }, { id: 2 }] });
    expect(decode("u[1\t]{id\ta?}:\n  1\t")).toEqual({ u: [{ id: 1 }] });
    expect(decode("u[1]{ id , a? }:\n  1,")).toEqual({ u: [{ id: 1 }] });
  });

  it("still needs a value in other fields", () => {
    expect(error("u[1]{id,a?}:\n  , 1")).toBe("Missing value (line 2, column 3)");
    expect(error("u[1]{id?,a}:\n  1")).toBe("Expected 2 values, got 1 (line 2, column 1)");
    expect(error("u[1]{a ?}:\n  1")).toBe("Expected ',' or '}' in table header (line 1, column 8)");
    expect(error("u[]: 1, , 2")).toBe("Missing value (line 1, column 9)");
  });

  it("reads optional fields leniently like the others", () => {
    const warnings: FlatWarning[] = [];
    expect(decode("u[1]{id,a?,b}:\n  1", { strict: false, onWarning: (w) => warnings.push(w) })).toEqual({ u: [{ id: 1, a: null, b: null }] });
    expect(warnings[0]!.message).toBe("Expected 3 values, got 1: the missing values are null");
  });
});

describe("encoding irregular lists", () => {
  const key = fc.constantFrom("id", "name", "a", "b", "c d", "x.y");
  const leaf = fc.oneof(fc.string({ maxLength: 4 }), fc.integer(), fc.constant(null), fc.constantFrom("", " ", ",", "|", "\t"));
  const obj = fc.dictionary(key, fc.oneof(leaf, leaf, fc.dictionary(key, leaf, { maxKeys: 2 }), fc.array(leaf, { maxLength: 2 })), { maxKeys: 4 });
  const list = fc.array(fc.oneof(obj, obj, obj, leaf, fc.array(obj, { maxLength: 2 })), { maxLength: 6 });
  const value = fc.oneof(list, fc.record({ items: list, nested: fc.record({ more: list }) }));

  it("round-trips with every delimiter and target", () => {
    fc.assert(
      fc.property(value, fc.constantFrom<Delimiter>(",", "|", "\t"), fc.constantFrom<"1.0" | "1.1">("1.0", "1.1"), (v, delimiter, target) => {
        const text = encode(v, { delimiter, target });
        expect(decode(text)).toEqual(asJson(v));
      }),
      { numRuns: RUNS },
    );
  });

  it("streams the same in any chunks", () => {
    fc.assert(
      fc.property(value, fc.integer({ min: 1, max: 7 }), (v, size) => {
        const text = encode(v);
        const d = createDecoder();
        for (let i = 0; i < text.length; i += size) d.write(text.slice(i, i + size));
        expect(d.end()).toEqual(decode(text));
      }),
      { numRuns: RUNS },
    );
  });

  it("round-trips object graphs with references", () => {
    const a = { id: 1, name: "a" };
    const b = { id: 2 };
    const graph: Record<string, unknown> = { list: [a, b, { id: 3, peer: a }], again: [b, { x: [a] }] };
    graph.self = [graph];
    const text = encode(graph, { refs: true });
    const back = decode(text, { refs: true }) as typeof graph;
    expect(encode(back, { refs: true })).toBe(text);
  });
});
