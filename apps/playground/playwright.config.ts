import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4173/flattype/" },
  webServer: { command: "vite preview", url: "http://localhost:4173/flattype/", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "chromium", use: devices["Desktop Chrome"] },
    { name: "firefox", use: devices["Desktop Firefox"] },
    { name: "webkit", use: devices["Desktop Safari"] },
    { name: "phone", use: devices["Pixel 7"] },
  ],
});
