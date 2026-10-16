// Fails if a package's minified + gzipped ESM bundle is over its budget.
// Other @flattype/* packages are left out: the budget is what each package adds on top of them.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";

const budgets = { core: 4 * 1024, models: 5 * 1024, http: 5 * 1024, react: 5 * 1024, vue: 5 * 1024, angular: 5 * 1024, svelte: 5 * 1024, "svelte/solid": 5 * 1024, ai: 5 * 1024 };
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
}
process.exit(failed ? 1 : 0);
