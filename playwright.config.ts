import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests against the real API and web app.
 * Needs Postgres with migrations applied: set E2E_DATABASE_URL (defaults to the local test DB).
 * Run with `npm run test:e2e`.
 */
const DATABASE_URL = process.env['E2E_DATABASE_URL'] ?? 'postgresql://careeros:password@localhost:5432/careeros_test';
const API_PORT = 3101;
const WEB_PORT = 5174;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev --workspace=apps/api',
      url: `http://localhost:${API_PORT}/api/health/live`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: {
        PORT: String(API_PORT),
        NODE_ENV: 'development',
        DATABASE_URL,
        JWT_SECRET: 'e2e-access-secret-that-is-at-least-32-characters',
        JWT_REFRESH_SECRET: 'e2e-refresh-secret-that-is-at-least-32-characters',
        BCRYPT_ROUNDS: '4',
        FRONTEND_URL: `http://localhost:${WEB_PORT}`,
        CORS_ORIGINS: `http://localhost:${WEB_PORT}`,
        STORAGE_LOCAL_PATH: './.e2e-uploads',
        LOG_LEVEL: 'warn',
        SMTP_HOST: '',
      },
    },
    {
      command: `npm run dev --workspace=apps/web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 60_000,
      env: { VITE_API_URL: '/api', VITE_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
