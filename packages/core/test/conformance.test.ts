import fc from "fast-check";
import { readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DecodeOptions, EncodeOptions, FlatWarning } from "../src/index.js";
import { decode, encode, FlatDecodeError } from "../src/index.js";
import { parseJson, stringifyJson } from "../src/types.js";

/**
 * conformance/cases.json: what this implementation writes and reads, for other implementations (the Python
 * package) to match exactly. Regenerate with `UPDATE_CONFORMANCE=1 pnpm --filter @flattype/core test`.
 * conformance/1.0/cases.json is the suite of Flat Notation 1.0, frozen: it is checked here, never regenerated.
 */
const FILE = new URL("../../../conformance/cases.json", import.meta.url);
const FROZEN = new URL("../../../conformance/1.0/cases.json", import.meta.url);
const SEED = 20261016;
const VERSION = "1.1";

const encodeOptions: EncodeOptions[] = [{}, { tabular: "off" }, { delimiter: "|" }, { delimiter: "\t" }, { indent: 0 }, { target: "1.0" }];

const scalar = fc.oneof(
  fc.string(),
  fc.string({ unit: "grapheme" }),
  fc.constantFrom("", " ", "null", "true", "30", "-1.5e3", "{}", "[]", "a, b", "a|b", "a\tb", "#x", '"', "x: y", "\n", " x", "x﻿", "\ud800", "é", "😀"),
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.integer(),
  fc.boolean(),
  fc.constant(null),
);
const key = fc.oneof(fc.string(), fc.constantFrom("id", "a.b", "[0]", "x y", "", "-", "0", "__proto__"));
const table = fc
  .uniqueArray(key, { minLength: 1, maxLength: 4 })
  .chain((keys) =>
    fc.array(
      fc.tuple(...keys.map(() => fc.oneof(scalar, fc.record({ inner: scalar })))).map((vals) => Object.fromEntries(keys.map((k, i) => [k, vals[i]]))),
      { minLength: 1, maxLength: 4 },
    ),
  );
const value = fc.oneof(fc.jsonValue({ maxDepth: 3 }), fc.dictionary(key, scalar), table, fc.dictionary(key, table, { maxKeys: 3 }));

// Lists whose objects have different keys (1.1): optional table fields, and [+] items where a table can't be.
const field = fc.constantFrom("id", "name", "a", "x y", "__proto__", "a.b");
const irregularItem = fc.oneof(
  { weight: 4, arbitrary: fc.dictionary(field, fc.oneof(scalar, scalar, fc.record({ inner: scalar }, { requiredKeys: [] })), { maxKeys: 4 }) },
  { weight: 1, arbitrary: fc.dictionary(field, fc.array(fc.oneof(scalar, fc.record({ p: scalar })), { maxLength: 2 }), { maxKeys: 2 }) },
  { weight: 1, arbitrary: scalar },
  { weight: 1, arbitrary: fc.array(fc.oneof(scalar, fc.record({ q: scalar })), { maxLength: 2 }) },
);
const withId = fc.tuple(fc.integer(), fc.dictionary(field, scalar, { maxKeys: 3 })).map(([id, rest]) => ({ id, ...rest }));
const irregular = fc.oneof(
  fc.array(irregularItem, { minLength: 1, maxLength: 5 }),
  fc.array(withId, { minLength: 2, maxLength: 5 }),
  fc.record({ list: fc.array(withId, { minLength: 2, maxLength: 4 }), mixed: fc.array(irregularItem, { maxLength: 4 }) }),
);

const flatish = fc
  .array(
    fc.oneof(
      fc.constantFrom("[+]", ".", "?", "a[+].x: 1", ".y: 2", "{x,y?}", "?}", "?,", "a", "b.c", "__proto__", "[0]", "[1]", "[]", "[2]{x,y}", "[1|]{x|y}", "{", "}", ":", ": ", ", ", "|", "\t", '"', '\\"', "\\", "#", " ", "\n", "\r\n", "null", "true", "1", "-0.5e3", "1e400", "[", "]", ".", " = ", "~", "a = b", "b = ~", " "),
      fc.string({ maxLength: 4 }),
    ),
    { maxLength: 30 },
  )
  .map((parts) => parts.join(""));

const decodeOptions: DecodeOptions[] = [{}, { strict: false }, { refs: true }, { strict: false, refs: true }, { strict: false, skipInvalidLines: true }];

/** Only values every implementation can represent the same way: finite numbers, safe integers, no cycles. */
function portable(v: unknown, depth = 0): boolean {
  if (typeof v === "number") return Number.isFinite(v) && !Object.is(v, -0) && (!Number.isInteger(v) || Math.abs(v) <= Number.MAX_SAFE_INTEGER);
  if (v === null || typeof v !== "object") return true;
  if (depth > 50) return false; // a cycle
  return Object.values(v).every((x) => portable(x, depth + 1));
}

const handwritten = [
  "name: John\nage: 30\ncity: New York",
  'zip: "10001"\nversion: 1.0.0\nid: 007\nurl: http://x.io/a#b',
  "users[2]{id,name.first}:\n  1, Alice\n  2, Bob",
  "users[2|]{id|name}:\n  1 | A, B\n  2 | C",
  "t[\t]: a\tb\t c",
  ": 42",
  "[]: 1, 2",
  "[2]{id}:\n  1\n  2",
  "\r\n# comment\n  a: 1\r\nb: 2",
  'a: "\\u00e9\\n"\nb[]: "x, y", z',
  "a:",
  "a: 1\na: 2",
  "a[2]: 1",
  "a[1001]: 1",
  "a[99999999999999999999]: 1",
  "a.b: 1\na: 2",
  "a: 2\na.b: 1",
  "t[3]{x}:\n  1",
  "t[2]{x,y}:\n  1\n  1, 2, 3",
  'a: "abc',
  'a[]: "x" y',
  "a b: 1",
  "a.: 1",
  "a[x]: 1",
  "a[1|]: 1",
  "a[]{x}: 1",
  "a: 1\nt[1]{x}: junk\n 1",
  "a.x: 1\nb = a",
  "a.x: 1\nb = a\na.self = a\nc = ~",
  "l[0].x: 1\nl[1] = l[0]\nl[2].x: 3",
  "b = a",
  "a: 1\nb = a",
  "b = c\nc = d\nd.x: 1",
  "= a",
  "b = ",
  "b = a junk",
  "b = a\nb.x: 1",
  "a[]: 1\nb = a.length",
  'b = "q"\n"q"[0]: 1',
  "a.x: 1\nb = a\nb: 2",
  "Here is the data:\nname: Alice\nHope that helps!",
  "a: 1\nx.y[5000]: 1\nb: 2",
  "t[2]{x,x.y}:\n  1, 2\n  3, 4\nz: 1",
  "t: 1\nt.u[1]{x}:\n  1\nz: 2",
  "t: 1\nt.u[2]{x}:\n  1",
  "[2]{name,id}\n  Ann, 1\n  Bo, 2",
  "t[2]{a,b}\n  1, 2\n  3, 4\nz: 1",
  "t[1]{a}  \n  1",
  "t[1]{a} x\n  1",
  'a: "x" y, z\nb[]: "p" q, r\nc[]: "open',
  "t[2]{a,b}:\n  1\n  1, 2, 3",
  "t[1]{a,a}:\n  1, 2",
  "a[0]: 1\na[0]: 2\na[3]: 4",
  // 1.1
  "e[+].type: push\n.repo: r\n.c[1]{sha}:\n  a1\ne[+].type: star\n.user.login: u",
  "[+]: 1\n[+][]: 2, 3\n[+]: {}\n[+][+]: 4",
  "a[+].x: 1\nb: 2\n.y: 3",
  ".x: 1",
  "a[+].x: 1\n.[0]: 1",
  "a[+].x: 1\n.x: 2",
  "a[+].k[+].x: 1\n.y: 2",
  "a[+].x: 1\nb = a[+]",
  "a[+].x: 1\n.self = ~\n.peer = a[0]",
  "a[+]{x}: 1",
  'u[3]{id,name?,phone?}:\n  1, Ann, "555"\n  2, ,\n  3, "", null',
  "u[2|]{id|a.b?|a.c?}:\n  1 |  | 2\n  2 | |",
  "u[1\t]{id\ta?}:\n  1\t",
  "u[1]{id,a?}:\n  , 1",
  "u[1]{id?,a}:\n  1",
  "u[1]{a ?}:\n  1",
  "u[1]{a?,a?}:\n  1, 2",
  "a[+].x: 1\nnot a line\n.y: 2",
];

function decodeCase(text: string, options: DecodeOptions): Record<string, unknown> | undefined {
  const warnings: FlatWarning[] = [];
  try {
    const v = decode(text, { ...options, onWarning: (w) => warnings.push(w) });
    if (!portable(v)) return undefined;
    const json = JSON.stringify(v);
    if (json.length > 20_000) return undefined;
    return options.strict === false ? { text, options, value: JSON.parse(json), warnings } : { text, options, value: JSON.parse(json) };
  } catch (e) {
    if (!(e instanceof FlatDecodeError)) throw e;
    return { text, options, error: e.message };
  }
}

function build(): unknown {
  const encodeCases = fc.sample(value, { seed: SEED, numRuns: 300 }).flatMap((v) => {
    const plain = JSON.parse(JSON.stringify(v)) as unknown;
    if (!portable(plain)) return [];
    return encodeOptions.map((options) => ({ value: plain, options, text: encode(plain, options) }));
  });
  const texts = [...handwritten, ...fc.sample(flatish, { seed: SEED, numRuns: 600 })];
  const decodeCases = texts.flatMap((text) => decodeOptions.map((o) => decodeCase(text, o)).filter(Boolean));
  // Object graphs: a reader must turn each text back into the same graph, and writing it again gives the same text.
  const graph = fc.tuple(
    fc.array(fc.dictionary(fc.constantFrom("a", "b", "x y"), fc.jsonValue({ maxDepth: 1 }).filter(portable), { maxKeys: 3 }), { minLength: 1, maxLength: 4 }),
    fc.array(fc.tuple(fc.nat(), fc.nat(), fc.constantFrom("p", "q")), { maxLength: 5 }),
  );
  const refCases = fc.sample(graph, { seed: SEED, numRuns: 150 }).map(([nodes, links]) => {
    for (const [from, to, k] of links) (nodes[from % nodes.length] as Record<string, unknown>)[k] = nodes[to % nodes.length];
    return { text: encode({ nodes, first: nodes[0] }, { refs: true }) };
  });
  // Integers of any size: written as their digits, and read back exactly (`{ bigint: true }` in JavaScript).
  const integer = fc.oneof(fc.bigInt({ min: -(2n ** 128n), max: 2n ** 128n }), fc.constantFrom(2n ** 53n - 1n, 2n ** 53n, 2n ** 53n + 1n, -(2n ** 63n), 2n ** 64n - 1n));
  const bigValue = fc.oneof(
    fc.dictionary(key, integer, { minKeys: 1 }),
    fc.record({ ids: fc.array(integer, { minLength: 1 }) }),
    fc.record({ rows: fc.array(fc.record({ id: integer, n: fc.integer() }), { minLength: 1, maxLength: 4 }) }),
  );
  const bigintCases = fc.sample(bigValue, { seed: SEED, numRuns: 100 }).map((v) => {
    const text = encode(v);
    expect(decode(text, { bigint: true })).toEqual(normalize(v));
    return { value: v, text };
  });
  const irregularCases = fc.sample(irregular, { seed: SEED + 1, numRuns: 200 }).flatMap((v) => {
    const plain = JSON.parse(JSON.stringify(v)) as unknown;
    if (!portable(plain)) return [];
    return encodeOptions.map((options) => ({ value: plain, options, text: encode(plain, options) }));
  });
  return { version: VERSION, encode: [...encodeCases, ...irregularCases], decode: decodeCases, refs: refCases, bigint: bigintCases };
}

/** What `decode(text, { bigint: true })` gives for `v`: BigInts within 2^53 become numbers. */
function normalize(v: unknown): unknown {
  if (typeof v === "bigint") return v >= -(2n ** 53n) + 1n && v <= 2n ** 53n - 1n ? Number(v) : v;
  if (Array.isArray(v)) return v.map(normalize);
  if (v !== null && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, normalize(x)]));
  return v;
}

describe("conformance cases", () => {
  it("still reads and writes the frozen 1.0 suite", () => {
    const frozen = parseJson(readFileSync(FROZEN, "utf8")) as Record<string, { text: string; value?: unknown; options?: Record<string, unknown>; error?: string }[]>;
    // Integers beyond 2^53 need JSON.parse source text access (Node 21+) to be read exactly.
    const sourceText = (() => {
      let ok = false;
      JSON.parse("1", (_k, v, ctx?: { source?: string }) => ((ok = typeof ctx?.source === "string"), v));
      return ok;
    })();
    for (const c of [...frozen.encode!, ...(sourceText ? frozen.bigint! : [])]) {
      expect(encode(c.value, { ...(c.options as EncodeOptions), target: "1.0" })).toBe(c.text);
    }
    // 1.1 only adds syntax: every 1.0 document means the same. Lines starting with "." were errors and still
    // are, at the same place, with a clearer message.
    const renamed = (v: unknown): unknown => JSON.parse(JSON.stringify(v).replaceAll("A '.' path needs a [+] item before it", "Expected ':' after path"));
    for (const c of frozen.decode!) expect(renamed(decodeCase(c.text, c.options as DecodeOptions))).toEqual(c);
  });

  it("conformance/cases.json is up to date", () => {
    // BigInts are written as plain JSON digits: Python's json module reads them exactly.
    const next = stringifyJson(build(), 1) + "\n";
    if (process.env.UPDATE_CONFORMANCE) writeFileSync(FILE, next);
    const current = readFileSync(FILE, "utf8");
    expect(current === next, "conformance/cases.json is stale: run UPDATE_CONFORMANCE=1 pnpm --filter @flattype/core test").toBe(true);
  });
});
