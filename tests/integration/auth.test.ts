// Seam: Better Auth's real handler against a real Postgres (#5).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { auth } from "@/server/auth";
import { pool } from "@/server/db/client";
import { createStudent } from "../../tools/create-student";

const ORIGIN = process.env.APP_ORIGIN!;
const EMAIL = "student@example.com";
const PASSWORD = "correct horse battery";

const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  auth.handler(
    new Request(`${ORIGIN}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
      body: JSON.stringify(body),
    }),
  );
const signIn = (ip: string, password = PASSWORD, extra: Record<string, string> = {}) =>
  post("/sign-in/email", { email: EMAIL, password }, { "x-real-ip": ip, ...extra });

beforeAll(async () => {
  await createStudent(EMAIL, PASSWORD);
});
afterAll(() => pool.end());

describe("signing in", () => {
  it("lets the created Student sign in and keeps the session for 30 days", async () => {
    const res = await signIn("10.0.0.1");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);

    const session = await auth.api.getSession({ headers: new Headers({ cookie: cookie.split(";")[0]! }) });
    expect(session?.user.email).toBe(EMAIL);
    const days = (session!.session.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(29.9);
  });

  it("rejects a wrong password", async () => {
    expect((await signIn("10.0.0.2", "wrong password!!")).status).toBe(401);
  });

  it("has no public sign-up", async () => {
    const res = await post("/sign-up/email", { email: "stranger@example.com", password: "a long enough password", name: "x" }, { "x-real-ip": "10.0.0.3" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(429);
  });
});

describe("sign-in rate limit", () => {
  it("allows 5 attempts per minute per client IP, then answers 429", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await signIn("10.0.1.1", "wrong password!!")).status);
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    expect((await signIn("10.0.1.2")).status).toBe(200); // another IP is unaffected
  });

  it("reads the IP only from X-Real-IP, so a forged X-Forwarded-For doesn't reset the count", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push((await signIn("10.0.2.1", "wrong password!!", { "x-forwarded-for": `192.0.2.${i}` })).status);
    expect(statuses.at(-1)).toBe(429);
  });
});

describe("create-student", () => {
  it("refuses a second account", async () => {
    await expect(createStudent("other@example.com", "another long password")).rejects.toThrow(/already exists/);
  });

  it("refuses a password under 12 characters", async () => {
    await expect(createStudent("x@example.com", "short")).rejects.toThrow(/12 characters/);
  });
});
