// Fails if a package's minified + gzipped ESM bundle is over its budget, or if the core size badge in
// README.md is out of date (`--write` updates it). Other @flattype/* packages are left out: the budget is
// what each package adds on top of them.
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const write = process.argv.includes("--write");
const budgets = { core: 5 * 1024, models: 5 * 1024, http: 5 * 1024, react: 5 * 1024, vue: 5 * 1024, angular: 5 * 1024, svelte: 5 * 1024, "svelte/solid": 5 * 1024, ai: 5 * 1024 };
// Angular is built by ng-packagr, which writes its bundle to fesm2022/.
// "svelte/solid" is the package's second entry point.
const entry = (pkg) =>
  pkg === "angular"
    ? "./packages/angular/dist/fesm2022/flattype-angular.mjs"
    : pkg === "svelte/solid"
      ? "./packages/svelte/dist/solid.js"
      : `./packages/${pkg}/dist/index.js`;
let failed = false;
for (const [pkg, limit] of Object.entries(budgets)) {
  const out = await build({
    entryPoints: [entry(pkg)],
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
    external: ["@flattype/*", "react", "vue", "@angular/*", "rxjs", "tslib", "solid-js"],
  });
  const size = gzipSync(out.outputFiles[0].contents).length;
  const ok = size <= limit;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} @flattype/${pkg}: ${size} B min+gz (budget ${limit} B)`);
  if (pkg === "core") failed = badge(size) || failed;
}
process.exit(failed ? 1 : 0);

/** Keeps every mention of the core size (README badge, Why list, package table, docs home) in step. True if stale. */
function badge(bytes) {
  const kb = (bytes / 1024).toFixed(1);
  let stale = false;
  for (const file of ["README.md", "apps/docs/index.md"]) {
    const text = readFileSync(file, "utf8");
    const next = text
      .replace(/badge\/core-[\d.]+_KB_min%2Bgz/g, `badge/core-${kb}_KB_min%2Bgz`)
      .replace(/alt="[\d.]+ KB min\+gz"/g, `alt="${kb} KB min+gz"`)
      .replace(/The core is [\d.]+ KB min\+gz/g, `The core is ${kb} KB min+gz`)
      .replace(/(\[`@flattype\/core`\]\([^)]*\) \|[^|]*\| )[\d.]+ KB \|/g, `$1${kb} KB |`);
    if (next === text) continue;
    if (write) {
      writeFileSync(file, next);
      console.log(`     ${file}: core size updated to ${kb} KB`);
    } else {
      console.log(`FAIL ${file} gives a different core size than ${kb} KB: run pnpm check:size --write`);
      stale = true;
    }
  }
  if (write && stale === false) console.log("     (run pnpm sync:readmes to copy README.md into the packages)");
  return stale;
}
