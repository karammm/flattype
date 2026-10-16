// Renders docs/assets/flattype-intro.{mp4,gif} from scene.html. Every number and code sample in the
// video is real output from the built packages, computed here.
//   pnpm build && FFMPEG=/path/to/ffmpeg node scripts/video/record.mjs
// Needs ffmpeg (FFMPEG env var or on PATH) and Playwright's Chromium (`npx playwright install chromium`).
import { execFileSync, spawn } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import { encode as toon } from "@toon-format/toon";
import { encode, stats } from "../../packages/core/dist/index.js";
import { defineModel } from "../../packages/models/dist/index.js";
import { flatExpress } from "../../packages/http/dist/index.js";
import { run as runCLI } from "../../packages/cli/dist/index.js";
import { readFile as readFileAsync } from "node:fs/promises";
import express from "express";
import { users } from "../../fixtures/index.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "../../docs/assets");
const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
const FPS = 30;

const response = {
  page: 1,
  data: [
    { id: "1", full_name: "Alice Martin", created_at: "2026-01-01T09:00:00Z", role: "admin", address: { city: "Paris" } },
    { id: "2", full_name: "Bob Singh", created_at: "2026-01-02T10:30:00Z", role: "editor", address: { city: "Delhi" } },
    { id: "3", full_name: "Chen Wei", created_at: "2026-01-03T08:15:00Z", role: "viewer", address: { city: "Tokyo" } },
  ],
};
const flat = encode(response);
const small = stats(response);

const Address = defineModel({ city: "string" });
const User = defineModel({ id: "number", fullName: "string", createdAt: "date", role: "string", address: Address });
const first = User.parseList(response.data)[0];
const out = JSON.stringify(first, (k, v) => (k === "createdAt" ? `@Date(${v})` : v), 2).replace(
  /"@Date\((.*)\)"/,
  "Date(\"$1\")",
);

const big = users(1000);
const bigJson = JSON.stringify(big).length;
const bigFlat = encode(big).length;

// Two real requests to a real Express server using flatExpress().
const app = express();
app.use(flatExpress());
const sample = { users: response.data.slice(0, 2).map(({ id, full_name, role }) => ({ id: Number(id), name: full_name, role })) };
app.get("/users", (_req, res) => res.json(sample));
const server = await new Promise((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const base = `http://localhost:${server.address().port}`;
const plain = await (await fetch(`${base}/users`)).text();
const flatRes = await fetch(`${base}/users`, { headers: { accept: "text/x-flat" } });
const flatText = await flatRes.text();
server.close();

// Screenshots of the real example apps once their streamed export has finished.
async function screenshot(url) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(url);
  await page.getByText("Done: 200 rows").waitFor({ timeout: 20000 });
  await page.addStyleTag({ content: "main { margin: 0 auto !important; padding: 20px 24px !important; }" });
  const png = await page.locator("main").screenshot();
  await browser.close();
  return `data:image/png;base64,${png.toString("base64")}`;
}
async function screenshotViteApp(dir, port) {
  const appDir = join(here, "../../examples", dir);
  const { createServer } = await import(pathToFileURL(createRequire(join(appDir, "package.json")).resolve("vite")).href);
  const vite = await createServer({ root: appDir, configFile: join(appDir, "vite.config.ts"), logLevel: "error" });
  await vite.listen();
  const shot = await screenshot(`http://localhost:${port}/`);
  await vite.close();
  return shot;
}
// The Angular example is a production build (run `pnpm --filter @flattype/example-angular-app build` first).
async function screenshotAngularApp() {
  const server = spawn(process.execPath, ["e2e/server.mjs", "4187"], { cwd: join(here, "../../examples/angular-app"), stdio: ["ignore", "pipe", "inherit"] });
  await new Promise((resolve) => server.stdout.once("data", resolve));
  try {
    return await screenshot("http://127.0.0.1:4187/");
  } finally {
    server.kill();
  }
}
const shotReact = await screenshotViteApp("react-app", 5179);
const shotVue = await screenshotViteApp("vue-app", 5180);
const shotAngular = await screenshotAngularApp();
const shotSvelte = await screenshotViteApp("svelte-app", 5181);

// Real runs of the CLI on the test fixtures, captured in memory.
async function cliOutput(argv, stdin = "") {
  let out = "";
  let err = "";
  await runCLI(argv, {
    readFile: (p) => readFileAsync(join(here, "../../packages/cli/test/fixtures", p), "utf8"),
    writeFile: async () => {},
    stdin: async () => stdin,
    stdout: (t) => void (out += t),
    stderr: (t) => void (err += t),
  });
  return err + out;
}
const genOut = (await cliOutput(["gen", "--openapi", "openapi.yaml"])).split("\n");
const cliText = [
  "$ flattype stats users.json",
  (await cliOutput(["stats"], JSON.stringify(big))).trimEnd(),
  "",
  "$ flattype gen --openapi openapi.yaml",
  // The warning, then the Customer model (the import line and Address come first in the file).
  genOut[0],
  ...genOut.slice(genOut.findIndex((l) => l.startsWith("export const Customer")), genOut.findIndex((l) => l.startsWith("export type Customer")) + 1),
  "…",
].join("\n");

const data = {
  json: JSON.stringify(response, null, 2),
  jsonBytes: small.jsonBytes,
  flat,
  flatBytes: small.flatBytes,
  savedSmall: Math.round(small.saved * 100),
  notes: { 0: "plain key: value", 1: "keys written once; address.city is a nested path", 2: "then one row per user" },
  rules: [
    '<b>"1"</b> stays quoted because it is a string, so decode() gives back exactly the same JSON',
    "Mixed arrays fall back to paths: <b>items[0].id: 1</b>",
    "decode(encode(x)) is checked against <b>JSON.parse</b> with thousands of random inputs",
  ],
  code: [
    'import { defineModel } from "@flattype/models";',
    "",
    "const Address = defineModel({ city: \"string\" });",
    "const User = defineModel({",
    '  id: "number",       // "1" becomes 1',
    '  fullName: "string", // reads full_name',
    '  createdAt: "date",  // ISO string becomes Date',
    '  role: "string",',
    "  address: Address,",
    "});",
    "",
    "const users = User.parseList(res.data);",
  ].join("\n"),
  out,
  server: [
    'import express from "express";',
    'import { flatExpress } from "@flattype/http";',
    "",
    "const app = express();",
    "app.use(flatExpress());",
    "",
    'app.get("/users", (req, res) => {',
    "  res.json({ users });",
    "});",
  ].join("\n"),
  term: [
    "$ curl localhost:3000/users",
    plain.replace(/},{/g, "},\n  {"),
    "",
    '$ curl -H "Accept: text/x-flat" localhost:3000/users',
    `# Content-Type: ${flatRes.headers.get("content-type")}`,
    flatText,
  ].join("\n"),
  reactCode: [
    'import { useFlat } from "@flattype/react";',
    "",
    "function Users() {",
    '  const { data, error } = useFlat("/users", {',
    "    model: UsersPage,",
    "  });",
    "  if (error) return <Alert error={error} />;",
    "  if (!data) return <p>Loading users…</p>;",
    "",
    "  // data.data: User[], fully typed",
    "  return data.data.map((u) => (",
    "    <li key={u.id}>{u.fullName} · {u.address.city}</li>",
    "  ));",
    "}",
  ].join("\n"),
  vueCode: [
    '<script setup lang="ts">',
    'import { useFlat } from "@flattype/vue";',
    "",
    'const { data, error } = useFlat("/users", {',
    "  model: UsersPage,",
    "}); // data is a typed Ref, from the model",
    "</script>",
    "",
    "<template>",
    '  <li v-for="u in data?.data" :key="u.id">',
    "    {{ u.fullName }} · {{ u.address.city }}",
    "  </li>",
    "</template>",
  ].join("\n"),
  svelteCode: [
    '<script lang="ts">',
    '  import { flatStore } from "@flattype/svelte";',
    '  const users = flatStore("/api/users", {',
    "    model: UsersPage,",
    "  }); // a store: Svelte $users, Solid from(users)",
    "</script>",
    "",
    "{#each $users.data?.data ?? [] as u (u.id)}",
    "  <li>{u.fullName} · {u.address.city}</li>",
    "{/each}",
  ].join("\n"),
  angularCode: [
    "@Component({",
    "  template: `",
    "    @for (u of users.value()?.data; track u.id) {",
    "      <li>{{ u.fullName }} · {{ u.address.city }}</li>",
    "    }",
    "  `,",
    "})",
    "export class Users {",
    '  users = flatResource(() => "/users", {',
    "    model: UsersPage,",
    "  }); // signals, on top of HttpClient",
    "}",
  ].join("\n"),
  cli: cliText,
  bars: [
    { label: "JSON, 1,000 users (minified)", value: bigJson },
    { label: "TOON", value: toon(big).length },
    { label: "Flat Notation", value: bigFlat },
  ],
  llm: [
    `<b>${Math.round((1 - bigFlat / bigJson) * 100)}% fewer characters</b> than minified JSON for the same 1,000 users`,
    "<b>toPrompt(data)</b> + <b>fromModelOutput(reply, { model })</b>: Flat Notation in, typed models out",
    "<b>toolResult(data)</b> for MCP servers · <b>countTokens()</b> with Claude's token counter",
  ],
};

data.fw = [
  { kicker: "Step 4 · @flattype/react", file: "Users.tsx", url: "localhost:5179 · examples/react-app", code: data.reactCode, shot: shotReact },
  { kicker: "Step 4 · @flattype/vue", file: "Users.vue", url: "localhost:5180 · examples/vue-app", code: data.vueCode, shot: shotVue },
  { kicker: "Step 4 · @flattype/angular", file: "users.component.ts", url: "127.0.0.1:4187 · examples/angular-app (production build)", code: data.angularCode, shot: shotAngular },
  { kicker: "Step 4 · @flattype/svelte · Svelte & Solid", file: "Users.svelte", url: "localhost:5181 · examples/svelte-app", code: data.svelteCode, shot: shotSvelte },
];

const frames = mkdtempSync(join(tmpdir(), "flattype-video-"));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript((d) => (window.DATA = d), data);
await page.goto(pathToFileURL(join(here, "scene.html")).href);
const duration = await page.evaluate(() => window.DURATION);
const total = Math.round(duration * FPS);
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.render(t), i / FPS);
  await page.screenshot({ path: join(frames, `${String(i).padStart(5, "0")}.png`) });
  if (i % 150 === 0) console.log(`frame ${i}/${total}`);
}
await browser.close();

mkdirSync(assets, { recursive: true });
const mp4 = join(assets, "flattype-intro.mp4");
const gif = join(assets, "flattype-intro.gif");
const run = (args) => execFileSync(ffmpeg, ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });
run(["-framerate", String(FPS), "-i", join(frames, "%05d.png"), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "slow", "-movflags", "+faststart", mp4]);
run(["-i", mp4, "-vf", "fps=10,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle", gif]);
rmSync(frames, { recursive: true, force: true });
console.log(`wrote ${mp4}\nwrote ${gif}`);
