// Better Auth configuration (design §5, file 31).
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/server/db/client";
import * as schema from "@/server/db/schema";
import { sendEmail } from "@/server/email/resend";
import { passwordResetEmail } from "@/server/email/templates/password-reset";
import { log } from "@/server/log";

const origin = process.env.APP_ORIGIN;
if (!origin) throw new Error("APP_ORIGIN is not set");

// End-to-end runs sign in many times a minute. Only honoured for a localhost origin, so it can't weaken production.
const relaxed = process.env.RELAX_RATE_LIMITS === "1" && new URL(origin).hostname === "localhost";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL ?? origin,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [origin],
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 12,
    resetPasswordTokenExpiresIn: 3600,
    revokeSessionsOnPasswordReset: true,
    // Not awaited, so the reply takes as long whether or not the email exists (Better Auth's advice).
    sendResetPassword: async ({ user, url }) => {
      sendEmail(user.id, "password_reset", { to: user.email, ...passwordResetEmail(url) }).catch((e) => log.error("reset email not sent", { error: e }));
    },
  },
  session: { expiresIn: 30 * 24 * 3600, updateAge: 24 * 3600 },
  user: { additionalFields: { autoChangesPaused: { type: "boolean", defaultValue: false, input: false } } },
  rateLimit: {
    enabled: true, // Better Auth turns it off outside production by default
    storage: "database",
    // Per-path rules also replace Better Auth's built-in sign-in limit (3 per 10 s).
    customRules: {
      "/sign-in/email": { window: 60, max: relaxed ? 1000 : 5 },
      "/request-password-reset": { window: 60, max: relaxed ? 1000 : 3 },
      "/change-password": { window: 60, max: relaxed ? 1000 : 5 }, // it checks the current password
    },
  },
  // Caddy overwrites X-Real-IP with the connecting address; web is reachable only through Caddy.
  advanced: { ipAddress: { ipAddressHeaders: ["x-real-ip"] } },
  // U17: changing the password signs out every other device, whatever the caller asked.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/change-password") return { context: { ...ctx, body: { ...ctx.body, revokeOtherSessions: true } } };
    }),
  },
  plugins: [nextCookies()],
});
