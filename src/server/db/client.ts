// One pg pool per process (§8). Imported only by the data layer, auth, health, worker, tools and tests (eslint.config.mjs).
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

export const pool = new Pool({ connectionString: url, max: 5 });
export const db = drizzle(pool, { schema });
