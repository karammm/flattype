import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { decode, encode, FlatDecodeError } from "../src/index.js";
// @ts-expect-error: a plain script, shared with ports in other languages.
import { disagreement, loadGrammar } from "../../../conformance/grammar.mjs";

/**
 * spec/grammar.abnf against this decoder, on random documents: a strict decode succeeds exactly when the
 * grammar accepts every line, and a syntax error is reported on the first line the grammar rejects.
 */
const RUNS = Number(process.env.FUZZ_RUNS ?? 10000);
const SEED = Number(process.env.FUZZ_SEED ?? 20261017);
const g = loadGrammar();

const piece = fc.oneof(
  fc.constantFrom(
    "a", "b.c", '"k y"', "[0]", "[1]", "[]", "[|]", "[\t]", "[2]{x,y}", "[1|]{x|y}", "[1\t]{x\ty}", "{", "}", ":", ": ", ", ", "|",
    "\t", '"', '\\"', "\\u00e9", "\\", "#", " ", "\n", "\r\n", "\r", "null", "true", "1", "-0.5e3", "[", "]", ".", " = ", "~",
    "a = b", "b = ~", "[+]", "?", ".", "\u00a0", "\ufeff", "\u2028", "\u3000", "\u000b", "\u0000", "😀", '"x"', '"a,b"', '"a|b"', "{}", "[]",
  ),
  fc.string({ maxLength: 3 }),
);
const chaos = fc.array(piece, { maxLength: 24 }).map((parts) => parts.join(""));

// Lines that are nearly right, so every rule gets reached: real paths, terminals and cells, with noise around them.
const odd = fc.constantFrom(" ", "  ", "\t", "\u00a0", "\ufeff", "\u3000", "\u000b", "\r", ",", "|", '"', "\\", "#", "x");
const noise = fc.oneof({ weight: 3, arbitrary: fc.constant("") }, { weight: 2, arbitrary: odd });
const key = fc.constantFrom("a", "b", "id", "$x", "_-", '"k y"', '"a,b"', '"a|b"', '"\\u0041"', '"a\\"', '"');
const seg = fc.oneof(
  { weight: 5, arbitrary: key },
  { weight: 2, arbitrary: fc.constantFrom("[0]", "[1]", "[01]", "[+]") },
  { weight: 1, arbitrary: fc.constantFrom("[1|]", "[ 1]", "[x]", "[", "[+1]", "[++]") },
);
const sep = fc.oneof({ weight: 6, arbitrary: fc.constant(".") }, { weight: 1, arbitrary: fc.constantFrom("", " ", "..") });
// Some paths go on with "." from the last [+] item.
const path = fc
  .tuple(fc.constantFrom("", "", "", ".", ". "), fc.array(fc.tuple(seg, sep), { maxLength: 3 }))
  .map(([rel, parts]) => rel + parts.map(([s, d], i) => (i === 0 || s.startsWith("[") ? s : d + s)).join(""));
const mark = fc.constantFrom<[string, string]>([",", ""], [",", ""], ["|", "|"], ["\t", "\t"]);
const sepFor = (d: string): fc.Arbitrary<string> => (d === "," ? fc.constantFrom(",", ", ", " ,") : d === "|" ? fc.constantFrom("|", " | ") : fc.constant("\t"));
const wrongSep = fc.constantFrom(",", "|", "\t", ";");
const token = fc.constantFrom("x", "x y", "1", "-2.5e3", "null", "{}", "[]", '"q"', '"a,b"', '"a|b"', '"x" y', '"', '"\\"', '"\\u00e9"', "", "", "#c", "a:b", "x\u00a0y");
const cell = fc.tuple(noise, token, noise).map((p) => p.join(""));
const cells = (d: string): fc.Arbitrary<string> =>
  fc.array(fc.tuple(cell, fc.oneof({ weight: 8, arbitrary: sepFor(d) }, { weight: 1, arbitrary: wrongSep })), { minLength: 1, maxLength: 4 }).map((cs) =>
    cs.map(([c, s], i) => (i === 0 ? c : s + c)).join(""),
  );
const field = fc.tuple(
  fc.oneof({ weight: 4, arbitrary: fc.constant("") }, { weight: 1, arbitrary: fc.constantFrom(" ", "\t", "\u00a0") }),
  key,
  fc.constantFrom("", "", ".b", '."c d"', "."),
  fc.constantFrom("", "", "?", "?", " ?", "??"),
  fc.constantFrom("", "", " ", "\t"),
);
const fields = (d: string): fc.Arbitrary<string> =>
  fc.array(fc.tuple(field, fc.oneof({ weight: 8, arbitrary: fc.constant(d) }, { weight: 1, arbitrary: wrongSep })), { minLength: 1, maxLength: 3 }).map((fs) =>
    fs.map(([f, s], i) => (i === 0 ? "" : s) + f.join("")).join(""),
  );
const lead = fc.oneof({ weight: 4, arbitrary: fc.constant("") }, { weight: 1, arbitrary: fc.constantFrom(" ", "\t", "\u00a0") });
const pair = fc.tuple(lead, path, fc.constantFrom(":", ":", ": ", " :", ""), fc.oneof(cell, cells(","))).map((p) => p.join(""));
const inline = mark.chain(([d, m]) => fc.tuple(lead, path, fc.constant("[" + m + "]"), fc.constantFrom(":", ":", ": ", ""), cells(d)).map((p) => p.join("")));
const ref = fc.tuple(lead, path, fc.constantFrom(" = ", "=", " =", " = "), fc.oneof(path, fc.constantFrom("~", "~x", "a[]", "")), noise).map((p) => p.join(""));
const table = mark.chain(([d, m]) =>
  fc.tuple(
    lead,
    path,
    fc.integer({ min: 0, max: 3 }),
    fc.oneof({ weight: 6, arbitrary: fc.constant(m) }, { weight: 1, arbitrary: fc.constantFrom("|", "\t", "") }),
    fields(d),
    fc.constantFrom("}:", "}:", "}: ", "}", "}: x", "} :"),
    fc.array(cells(d), { maxLength: 4 }),
  ).map(([l, p, n, mk, f, end, rows]) => [l + p + "[" + n + mk + "]{" + f + end, ...rows.map((r) => "  " + r)].join("\n")),
);
const structured = fc
  .tuple(fc.array(fc.oneof(pair, inline, inline, ref, table, table), { minLength: 1, maxLength: 4 }), fc.constantFrom("\n", "\r\n"))
  .map(([ls, nl]) => ls.join("\n").replaceAll("\n", nl));
const document = fc.oneof({ weight: 1, arbitrary: chaos }, { weight: 4, arbitrary: structured });

function check(text: string): string | undefined {
  let error: { reason: string; line: number } | undefined;
  try {
    decode(text, { refs: true });
  } catch (e) {
    if (!(e instanceof FlatDecodeError)) throw e;
    error = { reason: e.reason, line: e.line };
  }
  return disagreement(g, text, error) as string | undefined;
}

// Corners the random documents reach only rarely.
const corners = [
  "a[]:", "a[]: ", "a[|]:", "t[1|]{a,b}:\n  1 | 2", "t[1\t]{a,b}:\n  1\t2", "t[1]{a|b}:\n  1, 2", 'a[]: "x"\u00a0, y', 'a[]: \u00a0"x, y"',
  'a[]: \u00a0"x", y', 'a[|]: \u00a0"x|y"', 't[1]{\ta}:\n  1', "t[1]{ a , b }:\n  1, 2", "a[1|]: x", "a[1|].b: x", "a : 1", " a: 1", "\u00a0a: 1",
  "\ufeffa: 1", "a:\u00a0", "a: \u00a0x\u00a0", '"a"."b": 1', '"a""b": 1', "a.[0]: 1", "a..b: 1", "[0]: x", "[]: 1, 2", ": 1", "a = b\u00a0", "a = ~ ",
  "a = ~x", "a[0] = b[1].c", "= a", " = a", "t[0]{a}:\nb: 1", "t[2]{a}:\n#x\n\n", "t[1]{a}:\r\n  1\r", "a: x\r\r", "a: \"\t\"",
  "a[+].x: 1\n.y: 2", ".x: 1", "a[+].x: 1\n.[0]: 1", "a[+].x: 1\n. y: 1", "a[+]: 1\nb = a[+]", "u[2]{id,a?}:\n  1,\n  , 2", "u[1]{a?}:\n  ",
  "u[1|]{a?|b}:\n  | 1", "u[1\t]{a?\tb}:\n\t1", "u[1]{a ?}:\n  1", "u[1]{a?b}:\n  1", "a[+]{x}:\n 1", "[+][+]: 1", "a.[+]: 1",
];

describe("spec/grammar.abnf", () => {
  it.each(corners)("agrees with the decoder on %j", (text) => {
    expect(check(text)).toBeUndefined();
  });

  it("agrees with the decoder on random documents", () => {
    fc.assert(
      fc.property(document, (text) => {
        expect(check(text)).toBeUndefined();
      }),
      { numRuns: RUNS, seed: SEED },
    );
  }, 60_000);

  it("accepts everything the encoder writes", () => {
    const value = fc.jsonValue({ maxDepth: 4 });
    const delimiter = fc.constantFrom<"," | "|" | "\t">(",", "|", "\t");
    fc.assert(
      fc.property(value, delimiter, (v, d) => {
        expect(check(encode(v, { delimiter: d }))).toBeUndefined();
      }),
      // Larger documents, so fewer: the conformance cases cover the encoder too.
      { numRuns: Math.ceil(RUNS / 5), seed: SEED },
    );
  }, 60_000);
});
