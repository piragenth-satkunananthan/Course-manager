import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // §6: only these may touch the database client, so every query stays scoped to the Student.
  {
    files: ["**/*.{ts,tsx}"],
    ignores: ["src/server/data/**", "src/server/auth.ts", "src/server/email/**", "src/app/api/health/route.ts", "src/worker/**", "tools/**", "scripts/**", "tests/**", "e2e/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [{ group: ["@/server/db/client", "**/server/db/client"], message: "Use src/server/data/ (scoped to the Student)." }] }] },
  },
  // Design file 8: local-time arithmetic goes through src/server/domain/time.ts only.
  {
    files: ["src/server/domain/**/*.ts"],
    ignores: ["src/server/domain/time.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "CallExpression[callee.property.name=/^(get|set)(Hours|Date|Day|Month|FullYear|Minutes)$/]",
          message: "Use src/server/domain/time.ts for local-time arithmetic.",
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "dist/**", "next-env.d.ts", "spikes/**", "coverage/**", "playwright-report/**", "test-results/**"]),
]);
