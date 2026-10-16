import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // examples/angular-app uses a newer Angular. Make every Angular import here, including Angular's
    // own internal ones, resolve to this package's Angular 19.
    dedupe: ["@angular/core", "@angular/compiler", "@angular/common", "@angular/platform-browser", "@angular/platform-browser-dynamic", "rxjs", "zone.js"],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "jsdom",
    setupFiles: ["test/setup.ts"],
    server: { deps: { inline: [/@angular/] } },
  },
});
