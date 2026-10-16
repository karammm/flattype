// ng-packagr copies `workspace:*` ranges verbatim into dist/package.json. Replace them with the
// real versions so the published package (published from dist/) installs correctly.
import { readFileSync, writeFileSync } from "node:fs";

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const distPath = new URL("../dist/package.json", import.meta.url);
const dist = JSON.parse(readFileSync(distPath, "utf8"));

for (const field of ["dependencies", "peerDependencies"]) {
  for (const [name, range] of Object.entries(dist[field] ?? {})) {
    if (!String(range).startsWith("workspace:")) continue;
    const pkg = read(`../../${name.replace("@flattype/", "")}/package.json`);
    // Lockstep: exact versions for dependencies, a caret range for peers ("workspace:^").
    dist[field][name] = range === "workspace:^" ? `^${pkg.version}` : pkg.version;
  }
}
delete dist.scripts;
delete dist.publishConfig?.directory;
writeFileSync(distPath, JSON.stringify(dist, null, 2) + "\n");
console.log(`dist/package.json finalized (${dist.name}@${dist.version})`);
