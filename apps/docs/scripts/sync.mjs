// Builds guide pages from sections of the root README, so the docs always say what the README (and npm)
// says. Output files are gitignored. Run before `vitepress dev` / `build`.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const docs = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(docs, "../../README.md"), "utf8");
const repo = "https://github.com/karammm/flattype/blob/main/";

/** README `## heading` -> page slug. */
const PAGES = {
  "Quick start": "getting-started",
  "Typed models": "models",
  HTTP: "http",
  React: "react",
  Vue: "vue",
  Angular: "angular",
  "Svelte and Solid": "svelte-solid",
  "Claude and LLMs": "llms",
  CLI: "cli",
};
/** README in-page anchors -> doc pages. */
const ANCHORS = {
  "#quick-start": "/guide/getting-started",
  "#the-format": "/guide/format",
  "#typed-models": "/guide/models",
  "#http": "/guide/http",
  "#react": "/guide/react",
  "#vue": "/guide/vue",
  "#angular": "/guide/angular",
  "#svelte-and-solid": "/guide/svelte-solid",
  "#claude-and-llms": "/guide/llms",
  "#cli": "/guide/cli",
  "#benchmarks": "/guide/benchmarks",
};

const sections = {};
for (const part of readme.split(/^## /m).slice(1)) {
  const nl = part.indexOf("\n");
  sections[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
}

const rewrite = (md) =>
  md
    .replace(/\]\((#[\w-]+)\)/g, (whole, a) => (ANCHORS[a] ? `](${ANCHORS[a]})` : whole))
    .replace(/\]\((?!https?:|#|\/)([^)\s]+)\)/g, (_, path) => `](${repo}${path})`)
    .replace(/(src|href)="(?!https?:|#|\/)([^"]+)"/g, (_, attr, path) => `${attr}="${repo}${path}"`);

const header = (title) => `<!-- Generated from README.md by scripts/sync.mjs. Edit the README instead. -->\n\n# ${title}\n\n`;

for (const [heading, slug] of Object.entries(PAGES)) {
  if (!sections[heading]) throw new Error(`README has no "## ${heading}" section`);
  let body = sections[heading];
  if (slug === "getting-started") {
    body += `\n\n## Why FlatType\n\n${sections["Why FlatType"]}\n\n## Packages\n\n${sections.Packages}`;
  }
  const title = { "getting-started": "Getting started", cli: "CLI and code generation", http: "HTTP" }[slug] ?? heading;
  writeFileSync(join(docs, "guide", `${slug}.md`), header(title) + rewrite(body) + "\n");
}
// The video and logos live in docs/assets (the README uses them too); copy, don't duplicate them in git.
mkdirSync(join(docs, "public"), { recursive: true });
for (const file of ["flattype-intro.mp4", "mark.svg", "logo-light.svg", "logo-dark.svg"]) {
  copyFileSync(join(docs, "../../docs/assets", file), join(docs, "public", file));
}
console.log(`Synced ${Object.keys(PAGES).length} guide pages from README.md`);
