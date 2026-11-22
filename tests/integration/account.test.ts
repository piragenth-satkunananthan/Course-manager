// Seam: password reset, change password and account deletion through Better Auth's real handler and the
// /api/v1 routes, against Postgres and a fake email server (#17).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as deleteAccount from "@/app/api/v1/account/delete/route";
import * as semesters from "@/app/api/v1/semesters/route";
import { auth } from "@/server/auth";
import { deleteAccount as deleteAccountNow } from "@/server/data/account";
import { pool } from "@/server/db/client";
import { client, ORIGIN, resetData, seedStudent } from "./api";

const EMAIL = "student@example.com";
const PASSWORD = "correct horse battery"; // seedStudent's
let emails: { to: string[]; subject: string; text: string }[] = [];
let server: Server;
let me: { id: string; cookie: string };
let ip = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      emails.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `m${emails.length}` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { EMAIL_API_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`, RESEND_API_KEY: "re_test" });
});
afterAll(() => new Promise((r) => server.close(r)));
beforeEach(async () => {
  emails = [];
  await resetData();
  me = await seedStudent(EMAIL);
});

const post = (path: string, body: object, headers: Record<string, string> = {}) =>
  auth.handler(new Request(`${ORIGIN}/api/auth${path}`, { method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, "x-real-ip": `10.7.0.${++ip}`, ...headers }, body: JSON.stringify(body) }));
const signIn = (password: string) => post("/sign-in/email", { email: EMAIL, password });
const sessionOf = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) });
const until = (check: () => boolean) => expect.poll(check, { timeout: 3000, interval: 25 }).toBe(true);
/** The reset link from the email, as the browser would follow it: the token. */
const tokenFromEmail = () => /reset-password\/([^?\s]+)/.exec(emails.at(-1)!.text)![1]!;

describe("forgot password (#17)", () => {
  it("replies the same for an unknown email and sends nothing", async () => {
    const known = await post("/request-password-reset", { email: EMAIL, redirectTo: "/reset-password" });
    const unknown = await post("/request-password-reset", { email: "nobody@example.com", redirectTo: "/reset-password" });
    expect([known.status, unknown.status]).toEqual([200, 200]);
    expect(await unknown.json()).toEqual(await known.json());
    await until(() => emails.length === 1);
    expect(emails[0]).toMatchObject({ to: [EMAIL], subject: "Reset your Course-manager password" });
    expect(emails[0]!.text).toContain(`${ORIGIN}/api/auth/reset-password/`);
  });

  it("the link sets a new password once and signs every session out", async () => {
    await post("/request-password-reset", { email: EMAIL, redirectTo: "/reset-password" });
    await until(() => emails.length === 1);
    const token = tokenFromEmail();
    expect((await post("/reset-password", { token, newPassword: "short" })).status).toBe(400); // 12 characters at least
    expect((await post("/reset-password", { token, newPassword: "a brand new password" })).status).toBe(200);
    expect(await sessionOf(me.cookie)).toBeNull();
    expect((await signIn(PASSWORD)).status).toBe(401);
    expect((await signIn("a brand new password")).status).toBe(200);
    expect((await post("/reset-password", { token, newPassword: "another new password" })).status).toBe(400); // used
  });

  it("the link stops working after 1 hour", async () => {
    await post("/request-password-reset", { email: EMAIL, redirectTo: "/reset-password" });
    await until(() => emails.length === 1);
    const newest = "(select id from verification order by created_at desc limit 1)";
    const { rows } = await pool.query(`select extract(epoch from expires_at - created_at)::int as seconds from verification where id = ${newest}`);
    expect(rows).toEqual([{ seconds: 3600 }]);
    await pool.query(`update verification set expires_at = now() - interval '1 second' where id = ${newest}`);
    expect((await post("/reset-password", { token: tokenFromEmail(), newPassword: "a brand new password" })).status).toBe(400);
  });

  it("allows 3 requests a minute from one address", async () => {
    const fromOne = () => post("/request-password-reset", { email: EMAIL, redirectTo: "/reset-password" }, { "x-real-ip": "10.8.0.1" });
    const statuses = [];
    for (let i = 0; i < 4; i++) statuses.push((await fromOne()).status);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe("change password (#17)", () => {
  it("needs the current password, and signs the other devices out even if the caller didn't ask (U17)", async () => {
    const other = (await signIn(PASSWORD)).headers.get("set-cookie")!.split(";")[0]!;
    const change = (currentPassword: string) => post("/change-password", { currentPassword, newPassword: "a brand new password" }, { cookie: me.cookie });
    expect((await change("wrong password!!")).status).toBe(400);
    expect((await change(PASSWORD)).status).toBe(200);
    expect(await sessionOf(other)).toBeNull();
    expect((await signIn("a brand new password")).status).toBe(200);
  });
});

describe("account deletion (#17)", () => {
  const remove = (password: string, cookie = me.cookie) => client(cookie)(deleteAccount.POST, "POST", "/account/delete", { body: { password } });
  const count = async (table: string) => Number((await pool.query(`select count(*) from ${table}`)).rows[0].count);

  it("refuses a wrong password and keeps everything; after 5 wrong ones it stops checking for 15 minutes", async () => {
    expect(await remove("wrong password!!")).toMatchObject({ status: 400, json: { error: { fieldErrors: { password: "That password isn't right" } } } });
    expect(await count('"user"')).toBe(1);
    expect(emails).toEqual([]);
    for (let i = 0; i < 4; i++) await remove("wrong password!!");
    expect(await remove(PASSWORD)).toMatchObject({ status: 429, json: { error: { code: "RATE_LIMITED" } } });
    expect(await count('"user"')).toBe(1);
  });

  it("emails a confirmation, asks the worker to unlink WhatsApp and waits for it, deletes every row, and signs out", async () => {
    await client(me.cookie)(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-08-03", endDate: "2026-12-18" } });
    await pool.query("insert into wa_session (student_id, status) values ($1, 'connected')", [me.id]);
    // The worker: sees the request and unlinks a moment later.
    const worker = (async () => {
      await expect.poll(async () => (await pool.query("select unlink_requested_at from wa_session")).rows[0]?.unlink_requested_at, { timeout: 3000, interval: 25 }).not.toBeNull();
      await new Promise((r) => setTimeout(r, 300));
      await pool.query("update wa_session set status = 'unlinked'");
    })();
    const started = Date.now();
    const res = await remove(PASSWORD);
    await worker;
    expect(res.status).toBe(204);
    expect(Date.now() - started).toBeLessThan(5000); // didn't wait the full 10 seconds
    expect(emails).toMatchObject([{ to: [EMAIL], subject: "Your Course-manager account was deleted" }]);
    for (const table of ['"user"', "session", "account", "semester", "wa_session"]) expect(await count(table)).toBe(0);
    expect(await sessionOf(me.cookie)).toBeNull();
  });

  it("proceeds after the wait when the worker never unlinks (it isn't running)", async () => {
    await pool.query("insert into wa_session (student_id, status) values ($1, 'connected')", [me.id]);
    const started = Date.now();
    await deleteAccountNow(me.id, PASSWORD, { waitMs: 400 });
    expect(Date.now() - started).toBeGreaterThanOrEqual(400);
    expect(await count('"user"')).toBe(0);
  });
});
