import { defineConfig, devices } from '@playwright/test';
import { origin } from './scripts/cabinet.mjs';

const webgl = { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } };

export default defineConfig({
  testDir: './tests',
  testMatch: 'cabinet.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: { baseURL: origin, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node scripts/serve-cabinet.mjs', url: `${origin}/health`, reuseExistingServer: false },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], ...webgl } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, ...webgl } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } } },
  ],
});
