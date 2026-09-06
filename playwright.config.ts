import { defineConfig, devices } from "@playwright/test";

/**
 * Real-browser acceptance harness for the mandatory MVP UI hotfixes
 * (FINAL_MVP_LAUNCH_COMPLETION.md §"UI acceptance gate").
 *
 * The suite runs against a PRODUCTION build (`next build && next start`) so it
 * verifies exactly what ships, including the demo/devtools gating that is
 * compiled out of production bundles.
 *
 * Browser binary: CI installs Playwright's own Chromium (`npx playwright
 * install --with-deps chromium`). Sandboxes without access to the Playwright
 * CDN can point `PW_CHROMIUM_PATH` at any local Chromium/Chrome build.
 */
const PORT = Number(process.env.PW_PORT ?? 3100);
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: {
      executablePath,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    },
  },
  projects: [
    {
      name: "desktop-light",
      testMatch: /mvp-ui-gate\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], colorScheme: "light", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "desktop-dark",
      testMatch: /mvp-ui-gate\.spec\.ts/,
      grep: /scrollbar|theme|sidebar/i,
      use: { ...devices["Desktop Chrome"], colorScheme: "dark", viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile",
      testMatch: /mvp-ui-mobile\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
