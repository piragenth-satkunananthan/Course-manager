// Better Auth configuration (design §5, file 31). Password reset arrives with #17.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";

const origin = process.env.APP_ORIGIN;
if (!origin) throw new Error("APP_ORIGIN is not set");

// End-to-end runs sign in many times a minute. Only honoured for a localhost origin, so it can't weaken production.
const relaxed = process.env.RELAX_RATE_LIMITS === "1" && new URL(origin).hostname === "localhost";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? origin,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [origin],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
  session: { expiresIn: 30 * 24 * 3600, updateAge: 24 * 3600 },
  user: { additionalFields: { autoChangesPaused: { type: "boolean", defaultValue: false, input: false } } },
  rateLimit: {
    enabled: true, // Better Auth turns it off outside production by default
    storage: "database",
    // Per-path rules also replace Better Auth's built-in sign-in limit (3 per 10 s).
    customRules: {
      "/sign-in/email": { window: 60, max: relaxed ? 1000 : 5 },
      "/request-password-reset": { window: 60, max: relaxed ? 1000 : 3 },
    },
  },
  // Caddy overwrites X-Real-IP with the connecting address; web is reachable only through Caddy.
  advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
  plugins: [nextCookies()],
});
