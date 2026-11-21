import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./tests/test-db";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", include: ["tests/unit/**/*.test.ts", "spikes/**/*.test.ts"] } },
      {
        resolve: { alias },
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/setup.ts"],
          env: {
            DATABASE_URL: TEST_DATABASE_URL,
            APP_ORIGIN: "http://localhost:3100",
            BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
          },
          fileParallelism: false,
        },
      },
    ],
  },
});
