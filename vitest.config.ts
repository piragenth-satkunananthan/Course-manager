import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

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
            DATABASE_URL: process.env.DATABASE_URL_TEST ?? "postgres://app:app@127.0.0.1:5432/course_manager_test",
            APP_ORIGIN: "http://localhost:3100",
            BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret-00",
          },
          fileParallelism: false,
        },
      },
    ],
  },
});
