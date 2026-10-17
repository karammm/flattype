#!/usr/bin/env node
// Checks Flat Notation documents against the ABNF grammar in spec/grammar.abnf. No dependencies.
//
//   node conformance/grammar.mjs file.flat ...   check documents (or stdin), e.g. what your encoder writes
//   node conformance/grammar.mjs --cases         check the grammar against every case in conformance/cases.json
//
// The ABNF interpreter is small and general: it finds every way a rule can match from a position (with
// memoization), so the grammar can stay as it reads in the specification, ambiguities and all.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (path) => fileURLToPath(new URL(path, import.meta.url));

// RFC 5234, appendix B: the core rules the grammar uses.
const CORE = `
ALPHA  = %x41-5A / %x61-7A
DIGIT  = %x30-39
HEXDIG = DIGIT / "A" / "B" / "C" / "D" / "E" / "F"
DQUOTE = %x22
SP     = %x20
HTAB   = %x09
CR     = %x0D
LF     = %x0A
`;

/** Parses ABNF text into { name: node }. Nodes: alt, cat, rep, ref, lit (case-insensitive or not), range. */
export function parseAbnf(text) {
  const rules = {};
  // Join continuation lines (those starting with whitespace) onto their rule, and drop comments.
  const logical = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = stripComment(raw);
    if (line.trim() === "") continue;
    if (/^\s/.test(line) && logical.length > 0) logical[logical.length - 1] += " " + line.trim();
    else logical.push(line.trim());
  }
  for (const def of logical) {
    const m = /^([A-Za-z][A-Za-z0-9-]*)\s*(=\/|=)\s*(.*)$/.exec(def);
    if (!m) throw new Error(`Bad ABNF rule: ${def}`);
    const [, name, op, body] = m;
    const node = new Parser(body).parse();
    const key = name.toLowerCase();
    rules[key] = op === "=/" && rules[key] ? { t: "alt", items: [rules[key], node] } : node;
  }
  return rules;
}

function stripComment(line) {
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuote = !inQuote;
    else if (line[i] === ";" && !inQuote) return line.slice(0, i);
  }
  return line;
}

class Parser {
  constructor(s) {
    this.s = s;
    this.i = 0;
  }
  parse() {
    const node = this.alt();
    this.space();
    if (this.i !== this.s.length) throw new Error(`Unexpected ABNF at "${this.s.slice(this.i)}"`);
    return node;
  }
  space() {
    while (/\s/.test(this.s[this.i] ?? "")) this.i++;
  }
  alt() {
    const items = [this.cat()];
    for (;;) {
      this.space();
      if (this.s[this.i] !== "/") break;
      this.i++;
      items.push(this.cat());
    }
    return items.length === 1 ? items[0] : { t: "alt", items };
  }
  cat() {
    const items = [];
    for (;;) {
      this.space();
      const c = this.s[this.i];
      if (c === undefined || c === "/" || c === ")" || c === "]") break;
      items.push(this.rep());
    }
    if (items.length === 0) throw new Error(`Empty ABNF sequence in "${this.s}"`);
    return items.length === 1 ? items[0] : { t: "cat", items };
  }
  rep() {
    const m = /^(\d*)(\*?)(\d*)/.exec(this.s.slice(this.i));
    this.i += m[0].length;
    const el = this.element();
    if (m[0] === "") return el;
    if (m[2] === "") return { t: "rep", min: Number(m[1]), max: Number(m[1]), el };
    return { t: "rep", min: m[1] === "" ? 0 : Number(m[1]), max: m[3] === "" ? Infinity : Number(m[3]), el };
  }
  element() {
    const s = this.s;
    const c = s[this.i];
    if (c === "(") {
      this.i++;
      const node = this.alt();
      this.space();
      if (s[this.i++] !== ")") throw new Error("Unclosed ( in ABNF");
      return node;
    }
    if (c === "[") {
      this.i++;
      const node = this.alt();
      this.space();
      if (s[this.i++] !== "]") throw new Error("Unclosed [ in ABNF");
      return { t: "rep", min: 0, max: 1, el: node };
    }
    if (c === '"' || (c === "%" && /[si]/i.test(s[this.i + 1]) && s[this.i + 2] === '"')) {
      let sensitive = false;
      if (c === "%") {
        sensitive = s[this.i + 1].toLowerCase() === "s";
        this.i += 2;
      }
      const end = s.indexOf('"', this.i + 1);
      const value = s.slice(this.i + 1, end);
      this.i = end + 1;
      return { t: "lit", cps: [...value].map((x) => x.codePointAt(0)), sensitive };
    }
    if (c === "%") {
      const base = { x: 16, d: 10, b: 2 }[s[this.i + 1].toLowerCase()];
      const m = /^[0-9A-Fa-f]+((?:-[0-9A-Fa-f]+)|(?:\.[0-9A-Fa-f]+)*)/.exec(s.slice(this.i + 2));
      this.i += 2 + m[0].length;
      const parts = m[0].split(/[-.]/).map((x) => parseInt(x, base));
      if (m[0].includes("-")) return { t: "range", lo: parts[0], hi: parts[1] };
      return { t: "lit", cps: parts, sensitive: true };
    }
    const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(s.slice(this.i));
    if (!m) throw new Error(`Unexpected ABNF at "${s.slice(this.i)}"`);
    this.i += m[0].length;
    return { t: "ref", name: m[0].toLowerCase() };
  }
}

const lower = (cp) => (cp >= 65 && cp <= 90 ? cp + 32 : cp);

/** A grammar over code points: `ends(rule, cps, pos)` is every position where `rule` can stop. */
export function grammar(text) {
  const rules = { ...parseAbnf(CORE), ...parseAbnf(text) };
  for (const [name, node] of Object.entries(rules)) {
    walk(node, (n) => {
      if (n.t === "ref" && !rules[n.name]) throw new Error(`Rule ${name} uses undefined rule ${n.name}`);
    });
  }
  let memo = new Map();
  let input = [];

  function ends(node, pos) {
    switch (node.t) {
      case "ref": {
        const key = node.name + "@" + pos;
        let r = memo.get(key);
        if (r === undefined) {
          memo.set(key, []); // left recursion would loop; the grammar has none
          r = ends(rules[node.name], pos);
          memo.set(key, r);
        }
        return r;
      }
      case "lit": {
        let p = pos;
        for (const cp of node.cps) {
          const c = input[p];
          if (c === undefined || (node.sensitive ? c !== cp : lower(c) !== lower(cp))) return [];
          p++;
        }
        return [p];
      }
      case "range": {
        const c = input[pos];
        return c !== undefined && c >= node.lo && c <= node.hi ? [pos + 1] : [];
      }
      case "alt": {
        const out = new Set();
        for (const item of node.items) for (const e of ends(item, pos)) out.add(e);
        return [...out];
      }
      case "cat": {
        let at = [pos];
        for (const item of node.items) {
          const next = new Set();
          for (const p of at) for (const e of ends(item, p)) next.add(e);
          at = [...next];
          if (at.length === 0) break;
        }
        return at;
      }
      case "rep": {
        const out = new Set();
        const seen = new Set();
        let at = [pos];
        for (let k = 0; at.length > 0; k++) {
          if (k >= node.min) for (const p of at) out.add(p);
          if (k === node.max) break;
          const next = new Set();
          for (const p of at) for (const e of ends(node.el, p)) if (k < node.min || !seen.has(e)) next.add(e);
          if (k >= node.min) for (const p of at) seen.add(p);
          at = [...next];
        }
        return [...out];
      }
    }
    throw new Error(`Unknown node ${node.t}`);
  }

  return {
    has: (name) => name.toLowerCase() in rules,
    /** Positions where `rule` can end, matching `cps` from `pos`. */
    ends(rule, cps, pos = 0) {
      if (cps !== input) {
        input = cps;
        memo = new Map();
      }
      if (!rules[rule.toLowerCase()]) throw new Error(`No rule ${rule}`);
      return ends({ t: "ref", name: rule.toLowerCase() }, pos);
    },
    /** True if `rule` matches all of `cps`. */
    matches(rule, cps) {
      return this.ends(rule, cps, 0).includes(cps.length);
    },
  };
}

function walk(node, f) {
  f(node);
  if (node.items) for (const n of node.items) walk(n, f);
  if (node.el) walk(node.el, f);
}

const HELPERS = `
x-lead        = *sptab [ path ]
x-header-comma = *sptab header-comma [ CR ]
x-header-pipe  = *sptab header-pipe [ CR ]
x-header-tab   = *sptab header-tab [ CR ]
`;

export function loadGrammar() {
  return grammar(readFileSync(here("../spec/grammar.abnf"), "utf8") + HELPERS);
}

/**
 * Checks a document line by line: the line grammar, plus the table rule (the `count` lines after a header are
 * rows, in that header's delimiter). Returns `{ ok: true }`, or the first line that doesn't match.
 * `upTo` stops after that line. A document that ends inside a table is reported with `unfinished`.
 */
export function checkDocument(g, text, upTo = Infinity) {
  const lines = text.split("\n");
  let rows = 0;
  let delimiter = "comma";
  for (let n = 1; n <= lines.length && n <= upTo; n++) {
    const cps = Array.from(lines[n - 1], (ch) => ch.codePointAt(0));
    if (rows > 0) {
      if (!g.matches("row-line-" + delimiter, cps)) return { ok: false, line: n, rule: "row-line-" + delimiter };
      rows--;
      continue;
    }
    if (!g.matches("line", cps)) return { ok: false, line: n, rule: "line" };
    for (const d of ["comma", "pipe", "tab"]) {
      if (!g.matches("x-header-" + d, cps)) continue;
      rows = headerCount(g, cps, d);
      delimiter = d;
      break;
    }
  }
  return rows > 0 && upTo === Infinity ? { ok: true, unfinished: rows } : { ok: true };
}

/** The row count of a header line: the first "[digits" where the path before it and the rest both match. */
function headerCount(g, cps, d) {
  const lead = new Set(g.ends("x-lead", cps, 0));
  const tail = d === "comma" ? /^\[(\d+)\]\{/ : d === "pipe" ? /^\[(\d+)\|\]\{/ : /^\[(\d+)\t\]\{/;
  const s = String.fromCodePoint(...cps);
  const offsets = [];
  for (let i = 0, u = 0; i < cps.length; i++) {
    offsets.push(u);
    u += cps[i] > 0xffff ? 2 : 1;
  }
  for (let p = 0; p < cps.length; p++) {
    if (cps[p] !== 91 || !lead.has(p)) continue;
    const m = tail.exec(s.slice(offsets[p]));
    if (m) return Number(m[1]);
  }
  throw new Error("Header without a count: " + s);
}

// Strict decoding errors that are about syntax: the grammar must reject the line they are on. Every other error
// (duplicates, conflicts, counts, reference targets) is about meaning: the grammar must accept the line.
const SYNTAX = [
  "Expected ':' after path",
  "Expected '.' or ':' before key",
  "Expected a key after '.'",
  "Unclosed '['",
  "Invalid index",
  "A delimiter mark is only allowed",
  "Unterminated quoted key",
  "Invalid quoted key",
  "Expected a field name",
  "in table header",
  "Missing value",
  "Invalid quoted string",
  "Unterminated string",
  "Expected delimiter after quoted string",
  "Table rows go on the following lines",
  "Expected a path or '~' after '='",
  "Unexpected text after reference",
  "The root can't be a reference",
];

/**
 * Whether the grammar agrees with what a strict decoder did with `text`: `error` is the decoder's
 * `{ reason, line }`, or undefined if it decoded. Returns undefined when they agree, otherwise what differs.
 */
export function disagreement(g, text, error) {
  if (!error) {
    const r = checkDocument(g, text);
    if (!r.ok) return `valid document rejected: line ${r.line} doesn't match ${r.rule}`;
    if (r.unfinished) return `valid document ends inside a table, ${r.unfinished} rows short`;
    return undefined;
  }
  const { reason, line } = error;
  if (reason === "References need { refs: true }") {
    // Refused before its syntax is read: only the lines before it are checked.
    const r = checkDocument(g, text, line - 1);
    return r.ok ? undefined : `lines before "${reason}" rejected: line ${r.line} doesn't match ${r.rule}`;
  }
  if (SYNTAX.some((s) => reason.includes(s))) {
    const before = checkDocument(g, text, line - 1);
    if (!before.ok) return `lines before "${reason}" rejected: line ${before.line} doesn't match ${before.rule}`;
    return checkDocument(g, text, line).ok ? `syntax error "${reason}" accepted: line ${line} matches the grammar` : undefined;
  }
  // A meaning error: every line up to it is well formed (all of them, when a table is short of rows).
  const r = /^Expected \d+ rows/.test(reason) ? checkDocument(g, text) : checkDocument(g, text, line);
  return r.ok ? undefined : `"${reason}" document rejected: line ${r.line} doesn't match ${r.rule}`;
}

function selfTest() {
  const g = loadGrammar();
  const cases = JSON.parse(readFileSync(here("cases.json"), "utf8"));
  const failures = [];
  const strict = [
    ...cases.encode.map((c) => ({ text: c.text })),
    ...cases.bigint.map((c) => ({ text: c.text })),
    ...cases.refs.map((c) => ({ text: c.text })),
    ...cases.decode.filter((c) => c.options.strict !== false),
  ];
  for (const c of strict) {
    const m = c.error && /^(.*) \(line (\d+), column \d+\)$/.exec(c.error);
    const why = disagreement(g, c.text, m ? { reason: m[1], line: Number(m[2]) } : undefined);
    if (why) failures.push(`${JSON.stringify(c.text).slice(0, 160)}\n    ${why}`);
  }
  const checked = strict.length;

  // The specification shows the grammar too: it must be this file, word for word.
  const spec = readFileSync(here("../spec/SPEC.md"), "utf8");
  const block = /<!-- grammar:start -->\n```abnf\n([\s\S]*?)```\n<!-- grammar:end -->/.exec(spec);
  if (!block) failures.push("spec/SPEC.md has no grammar block (<!-- grammar:start --> ... <!-- grammar:end -->)");
  else if (block[1] !== readFileSync(here("../spec/grammar.abnf"), "utf8")) failures.push("The grammar in spec/SPEC.md differs from spec/grammar.abnf");

  if (failures.length > 0) {
    console.error(failures.slice(0, 30).join("\n"));
    console.error(`\n${failures.length} of ${checked} documents disagree with spec/grammar.abnf`);
    process.exit(1);
  }
  console.log(`All ${checked} conformance documents agree with spec/grammar.abnf`);
}

function checkFiles(files) {
  const g = loadGrammar();
  const inputs = files.length > 0 ? files.map((f) => [f, readFileSync(f, "utf8")]) : [["stdin", readFileSync(0, "utf8")]];
  let bad = 0;
  for (const [name, text] of inputs) {
    const r = checkDocument(g, text);
    if (!r.ok) {
      bad++;
      console.log(`${name}: line ${r.line} is not valid Flat Notation (rule ${r.rule})`);
    } else if (r.unfinished) {
      bad++;
      console.log(`${name}: ends inside a table, ${r.unfinished} rows short`);
    } else {
      console.log(`${name}: ok`);
    }
  }
  process.exit(bad > 0 ? 1 : 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  if (args[0] === "--cases") selfTest();
  else checkFiles(args);
}
