import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  // Escape non-ASCII characters so the bundle works even when served without a UTF-8 charset.
  esbuildOptions(options) {
    options.charset = "ascii";
  },
});
