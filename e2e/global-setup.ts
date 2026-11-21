// Fresh database with the one Student, for each run.
import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { E2E_ENV } from "../playwright.config";

export const STUDENT = { email: "student@example.com", password: "correct horse battery" };

export default async function globalSetup() {
  const pool = new Pool({ connectionString: E2E_ENV.DATABASE_URL });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await pool.end();
  const env = { ...process.env, ...E2E_ENV };
  execFileSync("npx", ["tsx", "tools/migrate.ts"], { env, stdio: "inherit" });
  execFileSync("npx", ["tsx", "tools/create-student.ts", "--email", STUDENT.email, "--password", STUDENT.password], { env, stdio: "inherit" });
}
