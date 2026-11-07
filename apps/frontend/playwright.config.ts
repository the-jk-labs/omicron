// SPDX-License-Identifier: AGPL-3.0-or-later
import process from "node:process";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: "100%",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "pnpm exec node tests/browser/fixture-api.ts",
      url: "http://127.0.0.1:4174/api/instance",
      reuseExistingServer: false,
    },
    {
      command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173/login",
      env: { INTERNAL_API_URL: "http://127.0.0.1:4174", PUBLIC_APP_NAME: "Omicron" },
      timeout: 120_000,
      reuseExistingServer: false,
    },
  ],
});
