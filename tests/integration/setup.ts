// Fresh, migrated test database for each run (design file 70).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

export async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST ?? "postgres://app:app@127.0.0.1:5432/course_manager_test" });
  await pool.query("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
}
