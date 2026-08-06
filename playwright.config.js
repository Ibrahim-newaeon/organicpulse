// playwright.config.js
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // SHA-256 hashing of multi-MB screenshots makes the bucket specs CPU-heavy;
  // too many workers on a small box causes timeout flakes that are not product
  // bugs. Anything that fails twice is a real defect.
  workers: process.env.CI ? 2 : 3,
  retries: 1,
  reporter: [['list']],
  use: {
    // Point CHROMIUM_PATH at an existing Chromium to skip `playwright install`
    // (e.g. CHROMIUM_PATH=/opt/pw-browsers/chromium in a sandbox).
    launchOptions: process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile',  use: { ...devices['Pixel 7'] } },
  ],
});
