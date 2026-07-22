import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

// Rendered-geometry harness (brief §6): the shell is measured at two reference widths, in both
// regimes, from a real browser — presence is not composition. The web server builds tokens, then
// the app, then serves the production preview.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: "line",
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: `pnpm --filter @wrizo/tokens build && pnpm exec vite build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
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
