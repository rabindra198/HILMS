import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Browser end-to-end configuration.
 *
 * Two real servers are started: the Express API (a spare port, so the
 * developer's own `:5000` dev server is never touched) and the Vite dev server
 * that proxies `/api` to it. No request is mocked - the tests drive the same
 * stack a person would.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_PORT = 5199;
const BACKEND_PORT = 5060;

export default defineConfig({
  testDir: './e2e',
  // The suites share one database and one session-revocation flow, so they run
  // one at a time in a single worker.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    headless: true,
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: [
    {
      command: 'node src/server.js',
      cwd: path.resolve(here, '..', 'server'),
      url: `http://127.0.0.1:${BACKEND_PORT}/health`,
      env: { ...process.env, PORT: String(BACKEND_PORT) },
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT} --strictPort`,
      cwd: here,
      url: `http://127.0.0.1:${FRONTEND_PORT}`,
      env: { ...process.env, VITE_API_PROXY_TARGET: `http://127.0.0.1:${BACKEND_PORT}` },
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
