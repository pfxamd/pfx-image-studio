import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './browser-tests',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
  },
  webServer: {
    command: 'npm run dev:browser',
    url: 'http://127.0.0.1:4173/browser-test/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'chromium-mobile',
      testMatch: /(resize-stress|release-acceptance|device-diagnostics)\.spec\.ts/,
      use: { ...devices['Pixel 7'], browserName: 'chromium' },
    },
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: { browserName: 'firefox' },
    },
  ],
});
