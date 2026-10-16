import { defineConfig, devices } from "@playwright/test";

const PORT = 4185;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  // `pnpm e2e` builds first; this serves dist/browser plus the API.
  webServer: { command: `node e2e/server.mjs ${PORT}`, url: `http://127.0.0.1:${PORT}/`, reuseExistingServer: !process.env.CI },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "firefox", use: devices["Desktop Firefox"] },
    { name: "webkit", use: devices["Desktop Safari"] },
  ],
});
