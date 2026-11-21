import { defineConfig, devices } from "@playwright/test";
import { TEST_DATABASE_URL } from "./tests/test-db";

const PORT = 3100;
export const E2E_ENV = {
  DATABASE_URL: TEST_DATABASE_URL,
  APP_ORIGIN: `http://localhost:${PORT}`,
  BETTER_AUTH_URL: `http://localhost:${PORT}`,
  BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000",
  RELAX_RATE_LIMITS: "1",
  DATA_ENCRYPTION_KEY: Buffer.from("e2e-key-e2e-key-e2e-key-e2e-key!").toString("base64"),
};

// Runs against the production build (`npm run build` first).
export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"], viewport: { width: 375, height: 812 } } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: "npm run start:standalone",
    url: `http://localhost:${PORT}/api/health`,
    env: { ...E2E_ENV, PORT: String(PORT), HOSTNAME: "localhost" },
    reuseExistingServer: false,
  },
});
