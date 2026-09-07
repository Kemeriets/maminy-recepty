import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  reporter: "list",
  use: { baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173", trace: "on-first-retry" },
  projects: [{ name: "Android Chrome", use: { ...devices["Pixel 7"] } }, { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.PLAYWRIGHT_BASE_URL ? undefined : { command: "npm run dev -- --port 4173", url: "http://127.0.0.1:4173", reuseExistingServer: true, timeout: 120_000 },
});
