#!/usr/bin/env node
// Runs the Flat Notation conformance suite against any implementation, in any language. No dependencies.
//
//   node conformance/run.mjs [options] -- <command that starts your adapter>
//
//   node conformance/run.mjs -- node conformance/adapters/javascript.mjs
//   node conformance/run.mjs -- uv run --project python python conformance/adapters/python.py
//   node conformance/run.mjs --only decoder,encoder -- ./target/release/flat-conformance
//   node conformance/run.mjs --cases conformance/1.0/cases.json -- ./my-adapter    (the frozen 1.0 suite)
//
// The adapter reads one JSON request per line on stdin and writes one JSON response per line on stdout.
// conformance/README.md describes the protocol and the levels.
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";

const LEVELS = [
  ["decoder", "Decoder"],
  ["encoder", "Encoder"],
  ["integers", "Exact integers"],
  ["lenient", "Lenient"],
  ["refs", "References"],
  ["messages", "Messages"],
  ["surrogates", "Unpaired surrogates"],
];

function usage(message) {
  if (message) console.error(message + "\n");
  console.error(`Usage: node conformance/run.mjs [--only levels] [--skip levels] [--show n] [--cases file] -- <adapter command>

  --only    comma-separated levels to run: ${LEVELS.map(([k]) => k).join(", ")}
            (messages are checked on the decode cases of the other levels that run)
  --skip    levels not to run, e.g. --skip surrogates where strings are always valid Unicode
  --show    failures to print per level (default 3)
  --cases   the case file (default: conformance/cases.json next to this script)`);
  process.exit(2);
}

// Integers past 2^53 must arrive exactly, so JSON is read with the source text of each number (Node 21+).
const hasSource = (() => {
  let ok = false;
  JSON.parse("1", (_k, v, ctx) => ((ok = typeof ctx?.source === "string"), v));
  return ok;
})();

function parseJson(text) {
  return JSON.parse(text, (_k, v, ctx) =>
    typeof v === "number" && !Number.isSafeInteger(v) && /^-?\d+$/.test(ctx?.source ?? "") ? BigInt(ctx.source) : v,
  );
}

/** JSON with BigInts written as their digits. */
function toJson(v) {
  if (typeof v === "bigint") return String(v);
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(toJson).join(",") + "]";
  return "{" + Object.keys(v).map((k) => JSON.stringify(k) + ":" + toJson(v[k])).join(",") + "}";
}

/**
 * Whether `got` (from the adapter) is the JSON value `want` (from the case): numbers by value, so 30 and 30.0
 * are equal, an integer beyond 2^53 digit for digit, and object keys in any order.
 */
function same(want, got) {
  const numeric = (x) => typeof x === "number" || typeof x === "bigint";
  if (numeric(want) && numeric(got)) {
    if (typeof want === "bigint") return typeof got === "bigint" ? want === got : Number.isSafeInteger(got) && BigInt(got) === want;
    return want === (typeof got === "bigint" ? Number(got) : got);
  }
  if (want === null || got === null || typeof want !== "object" || typeof got !== "object") return want === got;
  if (Array.isArray(want) !== Array.isArray(got)) return false;
  if (Array.isArray(want)) return want.length === got.length && want.every((x, i) => same(x, got[i]));
  const keys = Object.keys(want);
  return keys.length === Object.keys(got).length && keys.every((k) => Object.prototype.hasOwnProperty.call(got, k) && same(want[k], got[k]));
}

// Strings with unpaired surrogates exist only where strings are UTF-16 (JavaScript, Java, C#). Their cases are a
// level of their own, so a port whose strings are always valid Unicode can pass every other level.
const LONE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
function hasLone(v) {
  if (typeof v === "string") return LONE.test(v);
  if (v === null || typeof v !== "object") return false;
  return Object.keys(v).some((k) => LONE.test(k) || hasLone(v[k]));
}

const show = (v) => (v === undefined ? "nothing" : toJson(v).slice(0, 300));

/** "Missing value (line 1, column 3)" -> { message, line, column } */
function splitError(s) {
  const m = /^([\s\S]*) \(line (\d+), column (\d+)\)$/.exec(s);
  return { message: m[1], line: Number(m[2]), column: Number(m[3]) };
}

class Adapter {
  constructor(command) {
    this.proc = spawn(command[0], command.slice(1), { stdio: ["pipe", "pipe", "inherit"] });
    this.waiting = undefined;
    this.queue = [];
    this.exited = undefined;
    this.nextId = 1;
    const lines = createInterface({ input: this.proc.stdout });
    lines.on("line", (line) => {
      if (line.trim() === "") return;
      if (this.waiting) {
        const w = this.waiting;
        this.waiting = undefined;
        w.resolve(line);
      } else this.queue.push(line);
    });
    this.proc.on("error", (e) => this.fail(`could not start the adapter: ${e.message}`));
    this.proc.on("exit", (code, signal) => this.fail(`the adapter exited (${signal ?? "code " + code})`));
    this.proc.stdin.on("error", () => {});
  }
  fail(why) {
    this.exited ??= why;
    if (this.waiting) {
      const w = this.waiting;
      this.waiting = undefined;
      w.reject(new Error(why));
    }
  }
  async send(request) {
    if (this.exited) throw new Error(this.exited);
    const id = this.nextId++;
    this.proc.stdin.write(toJson({ id, ...request }) + "\n");
    const line =
      this.queue.shift() ??
      (await new Promise((resolve, reject) => {
        const timer = setTimeout(() => this.fail("no answer within 30 seconds"), 30_000);
        this.waiting = {
          resolve: (l) => (clearTimeout(timer), resolve(l)),
          reject: (e) => (clearTimeout(timer), reject(e)),
        };
      }));
    let response;
    try {
      response = parseJson(line);
    } catch {
      throw new Error(`the adapter wrote a line that isn't JSON: ${line.slice(0, 200)}`);
    }
    if (response.id !== id) throw new Error(`expected the answer to request ${id}, got ${line.slice(0, 200)}`);
    return response;
  }
  close() {
    this.proc.stdin.end();
    setTimeout(() => this.proc.kill(), 1000).unref();
  }
}

function decodeOptions(o) {
  return { strict: o.strict !== false, refs: o.refs === true, skipInvalidLines: o.skipInvalidLines === true };
}

function encodeOptions(o, version) {
  return { delimiter: o.delimiter ?? ",", indent: o.indent ?? 2, tabular: o.tabular !== "off", refs: false, target: o.target ?? version };
}

/**
 * Compares a decode answer with the case: `[problem, messages]`. `problem` is undefined when the value, or the
 * error and warning positions, are right. `messages` is null when there is no message to compare, undefined when
 * the messages match, and what differs otherwise.
 */
function checkDecode(c, r) {
  if ("error" in c) {
    const want = splitError(c.error);
    if (!r.error) return [`expected the error "${c.error}", got the value ${show(r.value)}`, null];
    const got = r.error;
    if (got.line !== want.line || got.column !== want.column) {
      return [`expected an error at line ${want.line}, column ${want.column} (${want.message}), got line ${got.line}, column ${got.column} (${got.message})`, null];
    }
    return [undefined, got.message === want.message ? undefined : `expected the message "${want.message}", got "${got.message}"`];
  }
  if (r.error) return [`expected ${show(c.value)}, got the error "${r.error.message}" (line ${r.error.line}, column ${r.error.column})`, null];
  if (!same(c.value, r.value)) return [`expected ${show(c.value)}, got ${show(r.value)}`, null];
  if (!c.warnings) return [undefined, null];
  const got = r.warnings ?? [];
  const where = (ws) => ws.map((w) => `${w.line}:${w.column}`).join(", ") || "none";
  if (got.length !== c.warnings.length || got.some((w, i) => w.line !== c.warnings[i].line || w.column !== c.warnings[i].column)) {
    return [`expected warnings at ${where(c.warnings)}, got ${where(got)}`, null];
  }
  if (c.warnings.length === 0) return [undefined, null];
  const bad = c.warnings.findIndex((w, i) => w.message !== got[i].message);
  return [undefined, bad < 0 ? undefined : `expected the warning "${c.warnings[bad].message}", got "${got[bad].message}"`];
}

const sameText = (want, r) => [r.error ? `got the error "${r.error.message}"` : r.text === want ? undefined : `expected ${JSON.stringify(want)}, got ${JSON.stringify(r.text)}`, null];

async function main() {
  const argv = process.argv.slice(2);
  const dash = argv.indexOf("--");
  if (dash < 0 || dash === argv.length - 1) usage("Give the command that starts your adapter after --");
  const command = argv.slice(dash + 1);
  const flags = argv.slice(0, dash);
  let only = new Set(LEVELS.map(([k]) => k));
  let showN = 3;
  let file = fileURLToPath(new URL("cases.json", import.meta.url));
  for (let i = 0; i < flags.length; i++) {
    if (flags[i] === "--only") only = new Set(flags[++i].split(","));
    else if (flags[i] === "--skip") for (const k of flags[++i].split(",")) only.delete(k);
    else if (flags[i] === "--show") showN = Number(flags[++i]);
    else if (flags[i] === "--cases") file = flags[++i];
    else usage(`Unknown option ${flags[i]}`);
  }
  for (const k of only) if (!LEVELS.some(([l]) => l === k)) usage(`Unknown level ${k}`);
  if (!hasSource) usage("This runner needs Node.js 21 or later (JSON.parse source text access), to compare big integers exactly.");

  const cases = parseJson(readFileSync(file, "utf8"));
  // The 1.0 suite (conformance/1.0/cases.json) has no version field.
  const version = cases.version ?? "1.0";
  const levels = Object.fromEntries(LEVELS.map(([k]) => [k, { passed: 0, failed: 0, unsupported: 0, failures: [] }]));
  const adapter = new Adapter(command);
  const record = (level, problem, text) => {
    const l = levels[level];
    if (problem === "unsupported") l.unsupported++;
    else if (problem) {
      l.failed++;
      if (l.failures.length < showN) l.failures.push(`${JSON.stringify(text).slice(0, 200)}\n      ${problem}`);
    } else l.passed++;
  };
  /** Sends a request; an "unsupported" answer or a crash is recorded for the level, not thrown. */
  const ask = async (request) => {
    const r = await adapter.send(request);
    return r.unsupported ? "unsupported" : r;
  };

  const jobs = [];
  for (const c of cases.decode) {
    const o = decodeOptions(c.options);
    const level = o.refs ? "refs" : o.strict ? "decoder" : "lenient";
    jobs.push({ level, run: () => ask({ op: "decode", text: c.text, options: o }), check: (r) => checkDecode(c, r), text: c.text });
  }
  for (const c of cases.encode) {
    jobs.push({
      level: "encoder",
      run: () => ask({ op: "encode", value: c.value, options: encodeOptions(c.options, version) }),
      check: (r) => sameText(c.text, r),
      text: c.text,
      value: c.value,
    });
    // Everything the reference encoder writes must decode back.
    jobs.push({
      level: "decoder",
      run: () => ask({ op: "decode", text: c.text, options: decodeOptions({}) }),
      check: (r) => checkDecode({ value: c.value }, r),
      text: c.text,
      value: c.value,
    });
  }
  for (const c of cases.bigint) {
    jobs.push({
      level: "integers",
      run: () => ask({ op: "encode", value: c.value, options: encodeOptions({}, version) }),
      check: (r) => sameText(c.text, r),
      text: c.text,
    });
    jobs.push({
      level: "integers",
      run: () => ask({ op: "decode", text: c.text, options: decodeOptions({}) }),
      check: (r) => checkDecode({ value: c.value }, r),
      text: c.text,
    });
  }
  for (const c of cases.refs) {
    jobs.push({
      level: "refs",
      run: () => ask({ op: "reencode", text: c.text, options: { refs: true, target: version } }),
      check: (r) => sameText(c.text, r),
      text: c.text,
    });
  }

  for (const job of jobs) if (hasLone(job.text) || hasLone(job.value)) job.level = "surrogates";

  console.log(`Flat Notation ${version} conformance: ${command.join(" ")}\n`);
  let crashed;
  for (const job of jobs) {
    if (!only.has(job.level)) continue;
    let r;
    try {
      r = await job.run();
    } catch (e) {
      crashed = e.message;
      break;
    }
    if (r === "unsupported") {
      record(job.level, "unsupported", job.text);
      continue;
    }
    const [problem, messages] = job.check(r);
    record(job.level, problem, job.text);
    // Messages are compared wherever the rest of the answer was right and the case has an error or warnings.
    if (!problem && messages !== null && only.has("messages")) record("messages", messages, job.text);
  }
  adapter.close();

  const width = Math.max(...LEVELS.map(([, name]) => name.length));
  let failed = false;
  for (const [key, name] of LEVELS) {
    if (!only.has(key)) continue;
    const l = levels[key];
    const total = l.passed + l.failed + l.unsupported;
    const status =
      total === 0 ? "-" : l.failed > 0 ? "✗" : l.unsupported === total ? "not supported" : l.unsupported > 0 ? `incomplete (${l.unsupported} not supported)` : "✓";
    if (l.failed > 0) failed = true;
    console.log(`  ${name.padEnd(width)}  ${String(l.passed).padStart(5)} / ${String(total).padEnd(5)}  ${status}`);
    for (const f of l.failures) console.log(`      ${f}`);
  }
  if (crashed) {
    console.log(`\nStopped: ${crashed}`);
    process.exit(1);
  }
  const claimed = LEVELS.filter(([k]) => only.has(k) && levels[k].failed === 0 && levels[k].unsupported === 0 && levels[k].passed > 0).map(([, n]) => n);
  console.log(failed ? "\nSome cases fail." : `\nPasses: ${claimed.join(", ") || "nothing yet"}.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
