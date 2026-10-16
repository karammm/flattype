import { defineConfig } from "vitest/config";

export default defineConfig({
  // solid-js resolves to its server build in Node, where createResource never fetches; use the browser build.
  resolve: { conditions: ["browser", "development"] },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
