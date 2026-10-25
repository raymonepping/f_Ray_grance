// E2E against the running stack through the loopback gateway (real API, real auth).
// A synthetic owner is created in global setup and removed in teardown.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: {
    baseURL: process.env.FRAY_E2E_BASE_URL ?? 'http://localhost:8470',
    storageState: `${process.env.TMPDIR ?? '/tmp'}/fray-e2e-state.json`,
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
