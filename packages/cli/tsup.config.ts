import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    esbuildOptions(options) {
      options.charset = "ascii";
    },
  },
  {
    // The `flattype` command. ESM only, with a shebang.
    entry: { cli: "src/bin.ts" },
    format: ["esm"],
    target: "node18",
    banner: { js: "#!/usr/bin/env node" },
    define: { __VERSION__: JSON.stringify(version) },
    esbuildOptions(options) {
      options.charset = "ascii";
    },
  },
]);
