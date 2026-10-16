// Prints bytes, gzip bytes and parse time for each fixture as JSON, TOON and Flat Notation.
// Run `pnpm build` first.
import { gzipSync } from "node:zlib";
import { encode as toon, decode as untoon } from "@toon-format/toon";
import { decode, encode } from "../packages/core/dist/index.js";
import { fixtures } from "../fixtures/index.mjs";

const bytes = (s) => Buffer.byteLength(s);
const gz = (s) => gzipSync(s, { level: 9 }).length;
function time(fn) {
  for (let i = 0; i < 20; i++) fn();
  const runs = 200;
  const t = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return ((performance.now() - t) / runs).toFixed(3);
}
const pct = (a, b) => `${Math.round((1 - a / b) * 100)}%`;

const rows = [];
for (const [name, value] of Object.entries(fixtures)) {
  const json = JSON.stringify(value);
  const t = toon(value);
  const f = encode(value);
  rows.push({
    fixture: name,
    "json B": bytes(json),
    "toon B": bytes(t),
    "flat B": bytes(f),
    "flat vs json": pct(bytes(f), bytes(json)),
    "json gz": gz(json),
    "flat gz": gz(f),
    "parse json ms": time(() => JSON.parse(json)),
    "parse toon ms": time(() => untoon(t)),
    "parse flat ms": time(() => decode(f)),
  });
}
console.table(rows);
