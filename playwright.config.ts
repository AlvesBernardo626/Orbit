import 'dotenv/config';
import { defineConfig } from '@playwright/test';
const api = process.env.E2E_API_URL;
const desktop = process.env.E2E_DESKTOP_URL;
if (!api || !desktop)
  throw new Error('Configure E2E_API_URL e E2E_DESKTOP_URL (portas exclusivas de teste)');
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  expect: { timeout: 15000 },
  outputDir: 'test-results',
  use: {
    baseURL: desktop,
    viewport: { width: 1440, height: 960 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      channel: process.env.E2E_BROWSER_CHANNEL,
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  webServer: [
    {
      command: 'node scripts/e2e-server.mjs',
      url: `${api}/health/ready`,
      timeout: 120000,
      reuseExistingServer: false,
    },
    {
      command: 'npm run dev -w @orbit/desktop',
      url: desktop,
      env: { VITE_API_URL: api, DESKTOP_DEV_URL: desktop, ORBIT_BROWSER_ONLY: 'true' },
      timeout: 60000,
      reuseExistingServer: false,
    },
  ],
});
