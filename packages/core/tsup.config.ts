import { defineConfig } from "tsup";

// Escape non-ASCII characters so the bundles work even when served without a UTF-8 charset.
const ascii = (options: { charset?: string }): void => {
  options.charset = "ascii";
};

export default defineConfig([
  { entry: ["src/index.ts"], format: ["esm", "cjs"], dts: true, clean: true, esbuildOptions: ascii },
  // For a plain <script> tag or a CDN: everything on a `FlatType` global.
  {
    entry: { flattype: "src/index.ts" },
    format: ["iife"],
    globalName: "FlatType",
    minify: true,
    target: "es2018",
    outExtension: () => ({ js: ".min.js" }),
    esbuildOptions: ascii,
  },
]);
