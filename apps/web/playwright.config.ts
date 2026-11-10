import { defineConfig, devices } from '@playwright/test';

// Smoke tests run against the production build, the same files a phone installs, with the
// real Python API beside it (in-memory database, test-only keys) for the reminder tests.
const API_PORT = 8765;
const PYTHON = process.env.WB_PYTHON ?? '../api/.venv/bin/python';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
  projects: [
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'mobile-safari', use: { ...devices['iPhone 14'] } }
  ],
  webServer: [
    {
      command: `VITE_API_URL=http://localhost:${API_PORT} npm run build && npm run preview`,
      url: 'http://localhost:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: `${PYTHON} -m uvicorn app.main:app --app-dir ../api --port ${API_PORT}`,
      url: `http://localhost:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        WB_DATABASE_URL: 'sqlite://',
        WB_ALLOWED_ORIGINS: 'http://localhost:4173',
        WB_VAPID_PUBLIC_KEY: 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U',
        WB_VAPID_PRIVATE_KEY: 'e2e-only-not-a-real-key',
        WB_CRON_TOKEN: 'e2e'
      }
    }
  ]
});
