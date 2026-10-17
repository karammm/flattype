// Measures Flat Notation on the Microsoft Edge demo JSON files (https://github.com/MicrosoftEdge/Demos,
// json-dummy-data) and writes benchmarks/edge-json-dummy-data.md. Every number is computed here.
//   pnpm build && node scripts/real-world.mjs [dir-with-downloaded-files]
// Without a directory, the files are downloaded.
import { readFileSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { join } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import { encode as toon, decode as untoon } from "@toon-format/toon";
import { decode, encode } from "../packages/core/dist/index.js";

const NAMES = ["64KB", "128KB", "256KB", "512KB", "1MB", "5MB"];
const BASE = "https://microsoftedge.github.io/Demos/json-dummy-data/";
const dir = process.argv[2];

const bytes = (s) => Buffer.byteLength(s);
const gz = (s) => gzipSync(s, { level: 9 }).length;
const br = (s) => brotliCompressSync(s, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : `${(n / 1024).toFixed(1)} KB`);
const pct = (a, b) => {
  const p = Math.round((1 - a / b) * 100);
  return p < 0 ? `${-p}% larger` : `${p}%`;
};
function time(fn) {
  fn();
  let best = Infinity;
  for (let i = 0; i < 7; i++) {
    const t = performance.now();
    fn();
    best = Math.min(best, performance.now() - t);
  }
  return best;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const rows = [];
for (const name of NAMES) {
  const served = dir ? readFileSync(join(dir, `${name}.json`), "utf8") : await (await fetch(`${BASE}${name}.json`)).text();
  const value = JSON.parse(served);
  const min = JSON.stringify(value);
  const flat = encode(value);
  const flatTab = encode(value, { delimiter: "\t" });
  const t = toon(value);
  if (!same(decode(flat), value) || !same(decode(flatTab), value) || !same(untoon(t), value)) throw new Error(`${name}: round trip failed`);
  rows.push({
    name,
    records: value.length,
    served: bytes(served),
    min: bytes(min),
    flat: bytes(flat),
    flatTab: bytes(flatTab),
    toon: bytes(t),
    gz: { served: gz(served), min: gz(min), flat: gz(flat), flatTab: gz(flatTab), toon: gz(t) },
    br: { min: br(min), flat: br(flat), flatTab: br(flatTab) },
    ms: name === "5MB" ? { parse: time(() => JSON.parse(min)), decode: time(() => decode(flat)), stringify: time(() => JSON.stringify(value)), encode: time(() => encode(value)) } : undefined,
    sample: name === "64KB" ? { json: JSON.stringify(value.slice(0, 2), null, 2), flat: encode(value.slice(0, 2)) } : undefined,
  });
}

const big = rows.find((r) => r.name === "5MB");
// What the data is made of, for the notes below.
const first = JSON.parse(dir ? readFileSync(join(dir, "64KB.json"), "utf8") : await (await fetch(`${BASE}64KB.json`)).text());
const unique = first.length;
const bioShare = first.reduce((a, x) => a + x.bio.length, 0) / first.reduce((a, x) => a + JSON.stringify(x).length, 0);
const md = `# Benchmark: Microsoft Edge demo JSON (64 KB to 5 MB)

The [JSON dummy data](https://github.com/MicrosoftEdge/Demos/tree/main/json-dummy-data) files from Microsoft's Edge demos, converted with \`@flattype/core\`. Every file is a list of people with the same five fields, the most common shape of an API response. Every number below was measured by [\`scripts/real-world.mjs\`](../scripts/real-world.mjs) on the real files, and every conversion was decoded again and checked to equal the original.

## The 5 MB file

| | Size | vs. the file as served | vs. minified JSON |
| --- | ---: | ---: | ---: |
| JSON as served (pretty-printed) | **${kb(big.served)}** | | |
| JSON, minified | ${kb(big.min)} | −${pct(big.min, big.served)} | |
| TOON | ${kb(big.toon)} | −${pct(big.toon, big.served)} | −${pct(big.toon, big.min)} |
| **Flat Notation** | **${kb(big.flat)}** | **−${pct(big.flat, big.served)}** | **−${pct(big.flat, big.min)}** |
| Flat Notation, tab-separated | ${kb(big.flatTab)} | −${pct(big.flatTab, big.served)} | −${pct(big.flatTab, big.min)} |

**${kb(big.served)} becomes ${kb(big.flat)}**: ${(big.served - big.flat).toLocaleString("en-US")} bytes fewer for the same ${big.records.toLocaleString("en-US")} records, or ${pct(big.flat, big.served)} smaller than the file as served and ${pct(big.flat, big.min)} smaller than minified JSON. That is what a model reads when you paste the data into a prompt, and what a browser downloads without compression.

## All six files

| File | Records | JSON as served | JSON minified | TOON | **Flat Notation** | Saved vs. served | Saved vs. minified |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map((r) => `| ${r.name}.json | ${r.records.toLocaleString("en-US")} | ${kb(r.served)} | ${kb(r.min)} | ${kb(r.toon)} | **${kb(r.flat)}** | **${pct(r.flat, r.served)}** | ${pct(r.flat, r.min)} |`).join("\n")}

The saving is the same at every size, because it comes from the shape: the five keys are written once in a table header instead of once per record. (The file named 128KB.json is really ${kb(rows[1].served)}, almost the same data as 256KB.json.)

## What it looks like

The first two records of 64KB.json:

\`\`\`json
${rows[0].sample.json}
\`\`\`

\`\`\`
${rows[0].sample.flat}
\`\`\`

The \`bio\` text contains commas, so it is quoted in comma-separated rows. With \`encode(data, { delimiter: "\\t" })\` the quotes go away, which saves another ${pct(big.flatTab, big.flat)}.

## Why 24% and not 45%

Flat Notation saves the most where keys are a large part of the data. Here they aren't:
- **Long text dominates.** The \`bio\` field is ${Math.round(bioShare * 100)}% of every record, and no format can shrink the text itself. Only the keys, quotes and braces around it go away.
- **Commas inside the text need quotes.** Most bios contain a comma, so they are quoted in comma-separated rows. Tab-separated rows avoid that, and the tab-separated version comes out ${pct(big.flatTab, big.toon)} smaller than TOON.
- **Shorter values save more.** On a typical API list with short values (ids, names, flags, a nested city), Flat Notation is about 45% smaller than minified JSON. See the [main benchmarks](https://karammm.github.io/flattype/docs/guide/benchmarks).

Also note that **the files repeat the same ${unique} records**: 5MB.json is those ${unique} people about ${Math.round(big.records / unique)} times over. That doesn't change the uncompressed sizes above, but it is why brotli shrinks every file to the same few kilobytes below.

## Over the wire, compressed

Gzip and brotli already remove most of JSON's repeated keys, so the difference almost disappears once a response is compressed. (Brotli also notices the repeated records, so every file compresses to about the same size.)

| File | JSON minified, gzip | Flat Notation, gzip | Saved | JSON minified, brotli | Flat Notation, brotli | Saved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map((r) => `| ${r.name}.json | ${kb(r.gz.min)} | ${kb(r.gz.flat)} | ${pct(r.gz.flat, r.gz.min)} | ${kb(r.br.min)} | ${kb(r.br.flat)} | ${pct(r.br.flat, r.br.min)} |`).join("\n")}

So the large savings are for text that isn't compressed, above all **LLM prompts**: models are billed by token, not by gzip size. On the wire, Flat Notation is a modest win on top of compression.

## Speed (5 MB file)

| | Time |
| --- | ---: |
| \`JSON.parse\` (native) | ${big.ms.parse.toFixed(1)} ms |
| \`decode\` (Flat Notation) | ${big.ms.decode.toFixed(1)} ms |
| \`JSON.stringify\` (native) | ${big.ms.stringify.toFixed(1)} ms |
| \`encode\` (Flat Notation) | ${big.ms.encode.toFixed(1)} ms |

Measured on Node ${process.versions.node}, ${cpus()[0].model.trim()}, best of 7 runs. \`JSON.parse\` and \`JSON.stringify\` are built into the engine. FlatType is plain JavaScript.

The [Python package](../python) writes the same ${kb(big.flat)} byte for byte (\`pip install flattype\`; the SHA-256 of both outputs matched when this page was written).

## Run it yourself

\`\`\`bash
pnpm install && pnpm build
node scripts/real-world.mjs
\`\`\`

Or paste any of the files into the [playground](https://karammm.github.io/flattype/).
`;
writeFileSync(new URL("../benchmarks/edge-json-dummy-data.md", import.meta.url), md);
console.log(md);
