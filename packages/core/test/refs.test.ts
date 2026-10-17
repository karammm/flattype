import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decode, encode, FlatDecodeError } from "../src/index.js";

const RUNS = Number(process.env.FUZZ_RUNS ?? 1500);
const opts = { refs: true } as const;
type Node = Record<string, unknown>;

describe("references", () => {
  it("writes a shared object once and points to it after that", () => {
    const shared = { id: 1, name: "Alice" };
    const text = encode({ owner: shared, editor: shared }, opts);
    expect(text).toBe("owner.id: 1\nowner.name: Alice\neditor = owner");
    const back = decode(text, opts) as Node;
    expect(back.editor).toBe(back.owner);
    expect(back.owner).toEqual(shared);
  });

  it("writes cycles, including one back to the root", () => {
    const root: Node = { name: "root", child: { name: "child" } };
    (root.child as Node).parent = root;
    (root.child as Node).self = root.child;
    const text = encode(root, opts);
    expect(text).toBe("name: root\nchild.name: child\nchild.parent = ~\nchild.self = child");
    const back = decode(text, opts) as Node;
    expect((back.child as Node).parent).toBe(back);
    expect((back.child as Node).self).toBe(back.child);
  });

  it("points into table rows, and keeps a table when no row is shared", () => {
    const users = [{ id: 1 }, { id: 2 }];
    const text = encode({ users, admin: users[1] }, opts);
    expect(text).toBe("users[2]{id}:\n  1\n  2\nadmin = users[1]");
    const back = decode(text, opts) as { users: Node[]; admin: Node };
    expect(back.admin).toBe(back.users[1]);
  });

  it("drops the table when a row repeats or was already written", () => {
    const a = { id: 1 };
    expect(encode({ list: [a, a] }, opts)).toBe("list[+].id: 1\nlist[+] = list[0]");
    expect(encode({ first: a, list: [a, { id: 2 }] }, opts)).toBe("first.id: 1\nlist[+] = first\nlist[+].id: 2");
    const back = decode(encode({ list: [a, a] }, opts), opts) as { list: Node[] };
    expect(back.list[1]).toBe(back.list[0]);
  });

  it("handles shared arrays, empty containers and quoted keys", () => {
    const tags = ["a", "b"];
    const empty = {};
    const value = { "first tags": tags, again: tags, e: empty, f: empty };
    const text = encode(value, opts);
    expect(text).toBe('"first tags"[]: a, b\nagain = "first tags"\ne: {}\nf = e');
    const back = decode(text, opts) as Node;
    expect(back.again).toBe(back["first tags"]);
    expect(back.f).toBe(back.e);
  });

  it("encodes like before when nothing is shared", () => {
    const value = { a: { b: 1 }, list: [{ id: 1 }, { id: 2 }] };
    expect(encode(value, opts)).toBe(encode(value));
  });

  it("still throws on cycles, and repeats shared objects, without refs", () => {
    const a: Node = {};
    a.self = a;
    expect(() => encode(a)).toThrow(/refs: true/);
    const s = { id: 1 };
    expect(encode({ x: s, y: s })).toBe("x.id: 1\ny.id: 1");
  });

  it("is rejected unless the decoder opts in", () => {
    expect(() => decode("a.x: 1\nb = a")).toThrow(/References need \{ refs: true \}/);
    expect(decode("a.x: 1\nb = a", { strict: false })).toEqual({ a: { x: 1 } });
  });

  it("reports bad references", () => {
    const bad = (text: string): unknown => decode(text, opts);
    expect(() => bad("b = a")).toThrow(/'a' doesn't exist/);
    expect(() => bad("a: 1\nb = a")).toThrow(/isn't an object or array/);
    expect(() => bad("b = c\nc = d\nd.x: 1")).toThrow(/comes later/);
    expect(() => bad("= a")).toThrow(/root can't be a reference/);
    expect(() => bad("b = ")).toThrow(/Expected a path/);
    expect(() => bad("b = a junk")).toThrow(/Unexpected text/);
    expect(() => bad("b = a\nb.x: 1")).toThrow(/Path conflict/);
    expect(() => bad("b = __proto__")).toThrow(FlatDecodeError);
    expect(decode("b = a", { refs: true, strict: false })).toEqual({ b: null });
  });

  it("lets a later line win over a reference in lenient mode", () => {
    expect(decode("a.x: 1\nb = a\nb: 2", { refs: true, strict: false })).toEqual({ a: { x: 1 }, b: 2 });
  });

  it("round-trips random graphs of shared objects", () => {
    // Build a graph from a JSON-ish value by reusing some of its containers in other places.
    const graph = fc.tuple(fc.array(fc.dictionary(fc.constantFrom("a", "b", "c", "x y", "__proto__"), fc.jsonValue({ maxDepth: 2 })), { minLength: 1, maxLength: 5 }), fc.array(fc.tuple(fc.nat(), fc.nat(), fc.constantFrom("p", "q", "r")), { maxLength: 6 }));
    fc.assert(
      fc.property(graph, ([nodes, links]) => {
        for (const [from, to, key] of links) (nodes[from % nodes.length] as Node)[key] = nodes[to % nodes.length];
        const root = { nodes };
        const back = decode(encode(root, opts), opts) as { nodes: Node[] };
        // Same shape and the same sharing: re-encoding gives the same text.
        expect(encode(back, opts)).toBe(encode(root, opts));
        for (const [from, to, key] of links) {
          const f = from % nodes.length;
          if (nodes[f]![key] === nodes[to % nodes.length]) expect(back.nodes[f]![key]).toBe(back.nodes[to % nodes.length]);
        }
      }),
      { numRuns: RUNS },
    );
  });
});

describe("replacer and reviver", () => {
  it("applies a replacer function like JSON.stringify", () => {
    const value = { a: 1, secret: "x", list: [1, 2, 3], when: new Date(0) };
    const replacer = function (this: unknown, key: string, v: unknown): unknown {
      if (key === "secret") return undefined;
      return typeof v === "number" ? v * 10 : v;
    };
    expect(decode(encode(value, { replacer }))).toEqual(JSON.parse(JSON.stringify(value, replacer)));
  });

  it("passes the holder as this, and sees toJSON results first", () => {
    const seen: [string, unknown][] = [];
    encode({ d: new Date(0) }, {
      replacer(this: Record<string, unknown>, key, v) {
        seen.push([key, typeof v]);
        if (key === "d") expect(this.d).toBeInstanceOf(Date);
        return v;
      },
    });
    expect(seen).toEqual([["", "object"], ["d", "string"]]);
  });

  it("keeps only the listed keys with an array replacer", () => {
    const value = { b: 1, a: 2, c: { a: 3, z: 4 }, rows: [{ a: 1, b: 2 }] };
    expect(decode(encode(value, { replacer: ["a", "c", "rows"] }))).toEqual(JSON.parse(JSON.stringify(value, ["a", "c", "rows"])));
    expect(encode(value, { replacer: ["a", "c"] })).toBe("a: 2\nc.a: 3");
  });

  it("applies a reviver like JSON.parse", () => {
    const json = { created: "2024-01-01T00:00:00.000Z", n: [1, 2], drop: true, nested: { drop: 1, keep: 2 } };
    const reviver = (key: string, v: unknown): unknown =>
      key === "drop" ? undefined : key === "created" ? new Date(v as string) : typeof v === "number" ? v + 1 : v;
    const fromJson = JSON.parse(JSON.stringify(json), reviver);
    const fromFlat = decode(encode(json), { reviver });
    expect(fromFlat).toEqual(fromJson);
    expect((fromFlat as unknown as { created: Date }).created).toBeInstanceOf(Date);
  });

  it("matches JSON.parse's reviver call order on random values", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (v) => {
        const calls = (parse: (r: (k: string, x: unknown) => unknown) => unknown): string[] => {
          const out: string[] = [];
          parse((k, x) => (out.push(`${k}=${typeof x}`), x));
          return out;
        };
        const text = JSON.stringify(v);
        expect(calls((r) => decode(encode(v), { reviver: r }))).toEqual(calls((r) => JSON.parse(text, r)));
      }),
      { numRuns: RUNS },
    );
  });

  it("revives a shared object once and keeps cycles", () => {
    let calls = 0;
    const text = "a.x: 1\nb = a\na.self = a";
    const back = decode(text, { refs: true, reviver: (k, v) => (k === "a" || k === "b" ? (calls++, v) : v) }) as Node;
    expect(calls).toBe(1);
    expect(back.b).toBe(back.a);
    expect((back.a as Node).self).toBe(back.a);
  });
});

describe("skipInvalidLines", () => {
  const skip = { strict: false, skipInvalidLines: true } as const;

  it("drops lines that aren't Flat Notation", () => {
    expect(decode("Here is the data:\nname: Alice\nage: 30\nHope that helps!", skip)).toEqual({ name: "Alice", age: 30 });
    expect(() => decode("Here is the data:\nname: Alice", { strict: false })).toThrow(FlatDecodeError);
  });

  it("leaves no trace of a line that fails part way", () => {
    // `x.y` would be created before the index gap fails.
    expect(decode("a: 1\nx.y[5000]: 1\nb: 2", skip)).toEqual({ a: 1, b: 2 });
    expect(decode("a: 1\na.b: 2", skip)).toEqual({ a: 1 });
  });

  it("skips a bad table row without counting it, and drops a table whose path conflicts", () => {
    // Every row fails (x and x.y conflict), so none counts: the table keeps reading rows until the end.
    expect(decode("t[2]{x,x.y}:\n  1, 2\n  3, 4\nz: 1", skip)).toEqual({ t: [] });
    expect(decode("t[1]{x}:\n  1, 2, 3\n  2", skip)).toEqual({ t: [{ x: 1 }] });
    // t is a number, so t.u can't be written: the whole table is dropped.
    expect(decode("t: 1\nt.u[1]{x}:\n  1\nz: 2", skip)).toEqual({ t: 1, z: 2 });
  });

  it("is ignored in strict mode", () => {
    expect(() => decode("prose\na: 1", { skipInvalidLines: true })).toThrow(FlatDecodeError);
  });
});
