import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4174/flattype/docs/" },
  webServer: { command: "pnpm preview", url: "http://localhost:4174/flattype/docs/", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "phone", use: devices["Pixel 7"] },
  ],
});
