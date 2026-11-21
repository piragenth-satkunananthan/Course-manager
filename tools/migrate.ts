// Runs pending migrations from drizzle/ and exits (the `migrate` Compose service; design file 66a).
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "@/server/db/client";

await migrate(db, { migrationsFolder: process.env.MIGRATIONS_DIR ?? "drizzle" });
await pool.end();
console.log(JSON.stringify({ level: "info", msg: "migrations applied" }));
