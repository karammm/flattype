// Fails if a package's minified + gzipped ESM bundle is over its budget.
import { build } from "esbuild";
import { gzipSync } from "node:zlib";

const budgets = { core: 4 * 1024 };
let failed = false;
for (const [pkg, limit] of Object.entries(budgets)) {
  const out = await build({
    entryPoints: [`./packages/${pkg}/dist/index.js`],
    bundle: true,
    minify: true,
    format: "esm",
    write: false,
  });
  const size = gzipSync(out.outputFiles[0].contents).length;
  const ok = size <= limit;
  failed ||= !ok;
  console.log(`${ok ? "ok  " : "FAIL"} @flattype/${pkg}: ${size} B min+gz (budget ${limit} B)`);
}
process.exit(failed ? 1 : 0);
