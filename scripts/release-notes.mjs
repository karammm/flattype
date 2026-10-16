// Prints the CHANGELOG.md section for a version: node scripts/release-notes.mjs 1.2.0
import { readFileSync } from "node:fs";

const version = process.argv[2];
const text = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
const start = text.indexOf(`\n## ${version}\n`);
if (start < 0) {
  console.error(`No "## ${version}" section in CHANGELOG.md`);
  process.exit(1);
}
const body = text.slice(start + `\n## ${version}\n`.length);
const end = body.search(/\n## \d/);
console.log((end < 0 ? body : body.slice(0, end)).trim());
