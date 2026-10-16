import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.perf.ts"], testTimeout: 60_000 },
});
