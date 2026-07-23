import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 4173;
const API_PORT = 8080;
const API = `http://127.0.0.1:${API_PORT}`;

// Rendered floor at two reference widths (brief §6). Two web servers: the API (needs DATABASE_URL
// + migrations in the environment — CI's Postgres service, or `pnpm test:e2e:local` via the
// embedded db) and the web preview, which proxies /api to the API.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  workers: 1,
  reporter: "line",
  use: { baseURL: `http://localhost:${WEB_PORT}` },
  webServer: [
    {
      command: "pnpm --filter @wrizo/api start",
      url: `${API}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { HOST: "127.0.0.1", PORT: String(API_PORT), ALLOW_MEMORY_STORAGE: "true" },
    },
    {
      command: `pnpm --filter @wrizo/tokens build && pnpm exec vite build && pnpm exec vite preview --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: { API_URL: API },
    },
  ],
  projects: [
    {
      name: "laptop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "tablet",
      use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
    },
  ],
});
