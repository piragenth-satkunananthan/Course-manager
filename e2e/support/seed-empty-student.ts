// A second, empty account for end-to-end checks of empty states and of other Students' ids.
// create-student allows only one account, so this goes through Better Auth's internal adapter directly.
import { auth } from "@/server/auth";
import { pool } from "@/server/db/client";

const [email, password] = process.argv.slice(2) as [string, string];
const ctx = await auth.$context;
const user = await ctx.internalAdapter.createUser({ email, name: "Student", emailVerified: true }, { method: "admin" });
await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(password) });
await pool.end();
