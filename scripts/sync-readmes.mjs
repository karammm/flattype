// Copies README.md into each published package, with links and images made absolute so they work on npm.
import { readFileSync, writeFileSync } from "node:fs";

const RAW = "https://raw.githubusercontent.com/karammm/flattype/main/";
const BLOB = "https://github.com/karammm/flattype/blob/main/";
const readme = readFileSync("README.md", "utf8")
  .replace(/(src|srcset)="(?!https?:|#)([^"]+)"/g, (_, attr, path) => `${attr}="${RAW}${path}"`)
  .replace(/href="(?!https?:|#)([^"]+)"/g, (_, path) => `href="${BLOB}${path}"`)
  .replace(/\]\((?!https?:|#)([^)]+)\)/g, (_, path) => `](${BLOB}${path})`);
for (const pkg of ["core", "models", "http", "react", "vue", "angular", "svelte", "ai", "cli"]) writeFileSync(`packages/${pkg}/README.md`, readme);
console.log("Synced README into core, models, http, react, vue, angular, svelte, ai, cli");
