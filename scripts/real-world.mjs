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
import { fromModelOutput } from "../packages/ai/dist/index.js";
import { run as cli } from "../packages/cli/dist/index.js";

const NAMES = ["64KB", "128KB", "256KB", "512KB", "1MB", "5MB"];
// Both variants of each file are read: NAME.json (pretty-printed) and NAME-min.json.
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
  const load = async (file) => (dir ? readFileSync(join(dir, file), "utf8") : await (await fetch(`${BASE}${file}`)).text());
  const served = await load(`${name}.json`);
  // The site's "minified" variant, as served (it still has a space after each colon).
  const servedMin = await load(`${name}-min.json`);
  const value = JSON.parse(served);
  if (!same(JSON.parse(servedMin), value)) throw new Error(`${name}-min.json holds different data`);
  const min = JSON.stringify(value);
  const flat = encode(value);
  const flatTab = encode(value, { delimiter: "\t" });
  const t = toon(value);
  if (!same(decode(flat), value) || !same(decode(flatTab), value) || !same(untoon(t), value)) throw new Error(`${name}: round trip failed`);
  rows.push({
    name,
    records: value.length,
    served: bytes(served),
    servedMin: bytes(servedMin),
    min: bytes(min),
    flat: bytes(flat),
    flatTab: bytes(flatTab),
    toon: bytes(t),
    gz: { served: gz(served), servedMin: gz(servedMin), min: gz(min), flat: gz(flat), flatTab: gz(flatTab), toon: gz(t) },
    br: { servedMin: br(servedMin), min: br(min), flat: br(flat), flatTab: br(flatTab) },
    ms: name === "5MB" ? { parse: time(() => JSON.parse(min)), decode: time(() => decode(flat)), stringify: time(() => JSON.stringify(value)), encode: time(() => encode(value)) } : undefined,
    sample: name === "64KB" ? { json: JSON.stringify(value.slice(0, 2), null, 2), flat: encode(value.slice(0, 2)) } : undefined,
  });
}

const big = rows.find((r) => r.name === "5MB");
// What the data is made of, for the notes below.
const first = JSON.parse(dir ? readFileSync(join(dir, "64KB.json"), "utf8") : await (await fetch(`${BASE}64KB.json`)).text());
const unique = first.length;
const bioShare = first.reduce((a, x) => a + x.bio.length, 0) / first.reduce((a, x) => a + JSON.stringify(x).length, 0);
// missing-colon.json: 64KB-min.json with one colon removed.
const broken = dir ? readFileSync(join(dir, "missing-colon.json"), "utf8") : await (await fetch(`${BASE}missing-colon.json`)).text();
let jsonError = "";
try {
  JSON.parse(broken);
} catch (e) {
  jsonError = e.message;
}
const at = Number(/position (\d+)/.exec(jsonError)?.[1] ?? 0);
const snippet = broken.slice(broken.lastIndexOf("{", at), broken.indexOf(",", at + 12) );
const damagedName = /"name": "([^"]+)"/.exec(snippet)?.[1];
const idx = first.findIndex((r) => r.name === damagedName);
const flatLines = encode(first).split("\n");
const goodRow = flatLines[idx + 1];
const badRow = goodRow.replace(", ", " ");
const badFlat = [...flatLines.slice(0, idx + 1), badRow, ...flatLines.slice(idx + 2)].join("\n");
let flatError = "";
try {
  decode(badFlat);
} catch (e) {
  flatError = e.message;
}
const flatWarnings = [];
const lenient = decode(badFlat, { strict: false, onWarning: (w) => flatWarnings.push(w) });
const intact = lenient.filter((r, i) => same(r, first[i])).length;
let replyError = "";
try {
  fromModelOutput(broken);
} catch (e) {
  replyError = e.message;
}
// The CLI on the same text, saved as people.flat.
let cliWarnings = "";
await cli(["decode", "--lenient", "people.flat"], {
  readFile: async () => badFlat,
  writeFile: async () => {},
  stdin: async () => "",
  stdout: () => {},
  stderr: (t) => void (cliWarnings += t),
});
// The other slip that used to lose everything: a table header without its colon.
const noColon = encode(first).replace(/^(\[\d+\]\{[^}]*\}):/, "$1");
const headerWarnings = [];
const headerValue = decode(noColon, { strict: false, onWarning: (w) => headerWarnings.push(w) });

const md = `# Benchmark: Microsoft Edge demo JSON (64 KB to 5 MB, pretty and minified)

The [JSON dummy data](https://github.com/MicrosoftEdge/Demos/tree/main/json-dummy-data) files from Microsoft's Edge demos, both the pretty-printed \`.json\` and the \`-min.json\` versions, converted with \`@flattype/core\`. Every file is a list of people with the same five fields, the most common shape of an API response. Every number below was measured by [\`scripts/real-world.mjs\`](../scripts/real-world.mjs) on the real files, and every conversion was decoded again and checked to equal the original.

## The 5 MB file

| | Size | vs. 5MB.json | vs. 5MB-min.json |
| --- | ---: | ---: | ---: |
| 5MB.json, as served (pretty-printed) | **${kb(big.served)}** | | |
| 5MB-min.json, as served | **${kb(big.servedMin)}** | −${pct(big.servedMin, big.served)} | |
| JSON fully minified (\`JSON.stringify\`) | ${kb(big.min)} | −${pct(big.min, big.served)} | −${pct(big.min, big.servedMin)} |
| TOON | ${kb(big.toon)} | −${pct(big.toon, big.served)} | −${pct(big.toon, big.servedMin)} |
| **Flat Notation** | **${kb(big.flat)}** | **−${pct(big.flat, big.served)}** | **−${pct(big.flat, big.servedMin)}** |
| Flat Notation, tab-separated | ${kb(big.flatTab)} | −${pct(big.flatTab, big.served)} | −${pct(big.flatTab, big.servedMin)} |

- **From the pretty file:** ${kb(big.served)} becomes ${kb(big.flat)}, ${(big.served - big.flat).toLocaleString("en-US")} bytes fewer (${pct(big.flat, big.served)}).
- **From the minified file:** ${kb(big.servedMin)} becomes ${kb(big.flat)}, ${(big.servedMin - big.flat).toLocaleString("en-US")} bytes fewer (${pct(big.flat, big.servedMin)}). The site's minified files still have a space after every colon (\`"name": "Adeel Solangi"\`), so they're ${Math.round((big.servedMin / big.min - 1) * 100)}% bigger than JSON with no spaces at all. Even against that, Flat Notation is ${pct(big.flat, big.min)} smaller.

That's for the same ${big.records.toLocaleString("en-US")} records: what a model reads when you paste the data into a prompt, and what a browser downloads without compression.

## All six files

| File | Records | .json (pretty) | -min.json | JSON, no spaces | TOON | **Flat Notation** | Saved vs. .json | Saved vs. -min.json |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map((r) => `| ${r.name} | ${r.records.toLocaleString("en-US")} | ${kb(r.served)} | ${kb(r.servedMin)} | ${kb(r.min)} | ${kb(r.toon)} | **${kb(r.flat)}** | **${pct(r.flat, r.served)}** | **${pct(r.flat, r.servedMin)}** |`).join("\n")}

The saving is the same at every size, because it comes from the shape: the five keys are written once in a table header instead of once per record. (The files named 128KB are really ${kb(rows[1].served)} and ${kb(rows[1].servedMin)}, almost the same data as the 256KB ones.)

## What it looks like

The first two records of 64KB.json:

\`\`\`json
${rows[0].sample.json}
\`\`\`

\`\`\`
${rows[0].sample.flat}
\`\`\`

The \`bio\` text contains commas, so it is quoted in comma-separated rows. With \`encode(data, { delimiter: "\\t" })\` the quotes go away, which saves another ${pct(big.flatTab, big.flat)}.

## Why about a quarter, not half

Flat Notation saves the most where keys are a large part of the data. Here they aren't:
- **Long text dominates.** The \`bio\` field is ${Math.round(bioShare * 100)}% of every record, and no format can shrink the text itself. Only the keys, quotes and braces around it go away.
- **Commas inside the text need quotes.** Most bios contain a comma, so they are quoted in comma-separated rows. Tab-separated rows avoid that, and the tab-separated version comes out ${pct(big.flatTab, big.toon)} smaller than TOON.
- **Shorter values save more.** On a typical API list with short values (ids, names, flags, a nested city), Flat Notation is about 45% smaller than minified JSON. See the [main benchmarks](https://karammm.github.io/flattype/docs/guide/benchmarks).

Also note that **the files repeat the same ${unique} records**: 5MB.json is those ${unique} people about ${Math.round(big.records / unique)} times over. That doesn't change the uncompressed sizes above, but it is why brotli shrinks every file to the same few kilobytes below.

## Over the wire, compressed

Gzip and brotli already remove most of JSON's repeated keys, so the difference almost disappears once a response is compressed. (Brotli also notices the repeated records, so every file compresses to about the same size.)

| File | -min.json, gzip | Flat Notation, gzip | Saved | -min.json, brotli | Flat Notation, brotli | Saved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${rows.map((r) => `| ${r.name} | ${kb(r.gz.servedMin)} | ${kb(r.gz.flat)} | ${pct(r.gz.flat, r.gz.servedMin)} | ${kb(r.br.servedMin)} | ${kb(r.br.flat)} | ${pct(r.br.flat, r.br.servedMin)} |`).join("\n")}

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

## A broken file: missing-colon.json

The demo site also has [missing-colon.json](${BASE}missing-colon.json): 64KB-min.json with one character removed, the colon in \`${snippet.slice(snippet.indexOf('"language"'), snippet.indexOf('"language"') + 22)}…\`, record ${idx + 1} of ${first.length}.

| | What happens |
| --- | --- |
| \`JSON.parse\` | Throws \`${jsonError}\`. **0 of ${first.length} records** are read, because JSON is one nested value: one wrong character anywhere invalidates the whole document. |
| \`flattype encode missing-colon.json\` | Stops with the same message. FlatType reads JSON with \`JSON.parse\`, so it can't convert JSON that is already broken. |
| \`fromModelOutput(text)\` (\`@flattype/ai\`) | Throws \`ModelOutputError\`: *${replyError.replace(/\|/g, "\\|")}*. The arrow marks the spot; \`error.line\` and \`error.column\` hold the position. (Before 1.12 it returned \`{}\` without an error.) |

The same one-character slip **inside Flat Notation**, a missing comma in that record's row:

\`\`\`
${goodRow.slice(0, 64)}…    (original)
${badRow.slice(0, 64)}…     (comma missing)
\`\`\`

| | What happens |
| --- | --- |
| \`decode(text)\` | Throws \`${flatError}\`, pointing at that record's line. |
| \`decode(text, { strict: false, onWarning })\` | Reads all ${lenient.length} records. **${intact} are exactly right**; the damaged one has its fields shifted by one (\`name\` is \`"${lenient[idx].name}"\`, the last field is \`null\`), and \`onWarning\` says so: *line ${flatWarnings[0].line}, column ${flatWarnings[0].column}: ${flatWarnings[0].message}*. |

Each record is one line, so a mistake stays in its line, and the warning tells you which record to check. \`flattype decode --lenient\` prints the same warnings:

\`\`\`
$ flattype decode --lenient people.flat > people.json
${cliWarnings.trim()}
\`\`\`

A missing colon on the **table header** itself no longer loses the rows either: lenient decoding reads all ${headerValue.length} records and warns *line ${headerWarnings[0].line}, column ${headerWarnings[0].column}: ${headerWarnings[0].message}*.

## Run it yourself

\`\`\`bash
pnpm install && pnpm build
node scripts/real-world.mjs
\`\`\`

Or paste any of the files into the [playground](https://karammm.github.io/flattype/).
`;
writeFileSync(new URL("../benchmarks/edge-json-dummy-data.md", import.meta.url), md);
console.log(md);
