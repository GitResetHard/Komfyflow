import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) {
  throw new Error(
    "Browser acceptance creates synthetic accounts. Use a disposable loopback server, never a live deployment.",
  );
}

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  // A first-run failure must fail CI, not disappear behind a retry.
  retries: 0,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  outputDir: "test-results/browser",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    headless: true,
    screenshot: "on",
    trace: "retain-on-failure",
    video: "retain-on-failure",
    actionTimeout: 12_000,
    navigationTimeout: 30_000,
  },
  // The app and worker are real production processes started by CI. This local
  // mail endpoint merely prevents account creation from contacting a third party.
  webServer: {
    command: "node tests/browser/mail-sink.mjs",
    url: `http://127.0.0.1:${process.env.TEST_MAIL_PORT || "3101"}/health`,
    reuseExistingServer: false,
    timeout: 10_000,
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    { name: "chromium-mobile", use: { ...devices["Pixel 7"] } },
  ],
});
