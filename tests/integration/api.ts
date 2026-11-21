// Drives the real /api/v1 route handlers as a signed-in Student.
import { auth } from "@/server/auth";
import { pool } from "@/server/db/client";

export const ORIGIN = process.env.APP_ORIGIN!;
const PASSWORD = "correct horse battery";
let ipCounter = 0;

/** Empties every table that hangs off the user, so each test file starts clean. */
export const resetData = () => pool.query(`truncate "user", rate_limit cascade`);

/** Creates a Student directly (create-student allows only one) and signs them in. */
export async function seedStudent(email: string) {
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "Student", emailVerified: true }, { method: "admin" });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(PASSWORD) });
  const res = await auth.handler(
    new Request(`${ORIGIN}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": `10.9.0.${++ipCounter}` },
      body: JSON.stringify({ email, password: PASSWORD }),
    }),
  );
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
  return { id: user.id, cookie: res.headers.get("set-cookie")!.split(";")[0]! };
}

type Handler = (req: Request, ctx: { params?: Promise<Record<string, string>> }) => Promise<Response>;
type Call = { body?: unknown; params?: Record<string, string>; query?: Record<string, string>; origin?: string | null; cookie?: string | null };

/** Calls a route handler like Next.js would. Returns the status and parsed JSON (null for an empty body). */
export function client(cookie: string) {
  return async (handler: Handler, method: string, path: string, opts: Call = {}) => {
    const url = new URL(`${ORIGIN}/api/v1${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = {};
    const c = opts.cookie === undefined ? cookie : opts.cookie;
    if (c) headers.cookie = c;
    const origin = opts.origin === undefined ? ORIGIN : opts.origin;
    if (origin) headers.origin = origin;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    // Like Next.js: routes without a dynamic segment get no params at all.
    const ctx = opts.params ? { params: Promise.resolve(opts.params) } : {};
    const res = await handler(new Request(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) }), ctx);
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  };
}
