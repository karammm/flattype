// One-time: publishes a 0.0.0 placeholder for every planned @flattype/* package that isn't on npm yet,
// so each one can get a trusted publisher on npmjs.com and every real version publishes from CI.
//   node scripts/reserve-names.mjs            (in your own Terminal: npm may open the browser to confirm)
// Then on npmjs.com, for each package: Settings -> Trusted publishing -> GitHub Actions,
// repository karammm/flattype, workflow release.yml.
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PLANNED = ["http", "react", "vue", "angular", "svelte", "ai", "cli"];

function exists(name) {
  try {
    execFileSync("npm", ["view", name, "name"], { stdio: ["ignore", "pipe", "ignore"] });
    return true;
  } catch {
    return false;
  }
}

const reserved = [];
for (const dir of PLANNED) {
  const name = `@flattype/${dir}`;
  if (exists(name)) {
    console.log(`= ${name} already exists, skipping`);
    continue;
  }
  const tmp = mkdtempSync(join(tmpdir(), "flattype-reserve-"));
  writeFileSync(
    join(tmp, "package.json"),
    JSON.stringify(
      {
        name,
        version: "0.0.0",
        description: "Placeholder for an upcoming FlatType.js package. See https://github.com/karammm/flattype",
        license: "MIT",
        repository: { type: "git", url: "git+https://github.com/karammm/flattype.git", directory: `packages/${dir}` },
        homepage: "https://github.com/karammm/flattype#readme",
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(tmp, "README.md"),
    `# ${name}\n\nThis name is reserved for an upcoming [FlatType.js](https://github.com/karammm/flattype) package. See the [roadmap](https://github.com/karammm/flattype/blob/main/ROADMAP.md).\n`,
  );
  console.log(`> npm publish ${name}@0.0.0`);
  execFileSync("npm", ["publish", tmp, "--access", "public"], { stdio: "inherit" });
  reserved.push(name);
}
console.log(reserved.length ? `Reserved: ${reserved.join(", ")}` : "Nothing to reserve.");
console.log("Next: add the trusted publisher (karammm/flattype, release.yml) for each package on npmjs.com.");
