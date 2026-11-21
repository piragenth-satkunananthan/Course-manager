// The test database, shared by the integration and end-to-end suites.
import type { Pool } from "pg";

export const TEST_DATABASE_URL = process.env.DATABASE_URL_TEST ?? "postgres://app:app@127.0.0.1:5432/course_manager_test";

export const resetDatabase = (pool: Pool) =>
  pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
