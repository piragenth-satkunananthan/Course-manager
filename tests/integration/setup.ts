// Fresh, migrated test database for each run (design file 70).
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { resetDatabase, TEST_DATABASE_URL } from "../test-db";

export async function setup() {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  await resetDatabase(pool);
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  await pool.end();
}
