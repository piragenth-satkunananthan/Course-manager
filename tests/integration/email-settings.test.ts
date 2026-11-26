// Seam: Settings → Email and alerts (#82, U46): a confirmed address for emails, and alert kinds turned off, with a
// fake email server and a real Postgres.
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as confirm from "@/app/api/v1/email-confirm/route";
import * as semesters from "@/app/api/v1/semesters/route";
import * as emailSetting from "@/app/api/v1/settings/email/route";
import * as settings from "@/app/api/v1/settings/route";
import { pool } from "@/server/db/client";
import { raiseAlert } from "../../src/worker/scheduler/alerts";
import { runFinalReminders } from "../../src/worker/scheduler/jobs";
import { client, resetData, seedStudent } from "./api";

type Sent = { to: string[]; subject: string; text: string };
let sent: Sent[] = [];
let server: Server;
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      sent.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `m${sent.length}` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  Object.assign(process.env, { EMAIL_API_BASE_URL: `http://127.0.0.1:${(server.address() as { port: number }).port}`, RESEND_API_KEY: "re_test" });
});
afterAll(() => new Promise((r) => server.close(r)));

let a: ReturnType<typeof client>;
let studentId: string;
beforeEach(async () => {
  sent = [];
  await resetData();
  const me = await seedStudent("login@example.com");
  studentId = me.id;
  a = client(me.cookie);
});
const tokenIn = (text: string) => new URL(text.match(/https?:\/\/\S+confirm-email\S*/)![0]).searchParams.get("token")!;
// Opening the link shows a Confirm page; its button POSTs the token (mail scanners only GET links).
const open = (token: string) => client("")(confirm.POST, "POST", "/email-confirm", { body: { token } });

describe("sending emails to another address (#82)", () => {
  it("is used only after its link is opened; until then emails go to the login email", async () => {
    const res = await a(emailSetting.PUT, "PUT", "/settings/email", { body: { email: "Inbox@Example.com" } });
    expect(res.json).toMatchObject({ address: "login@example.com", pending: "inbox@example.com" });
    expect(sent).toEqual([expect.objectContaining({ to: ["inbox@example.com"], subject: "Confirm your email for Course-manager" })]);

    // A reminder before confirming still goes to the login email
    const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-12-01", endDate: "2027-03-31" } })).json.id;
    const courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
    await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab", dueDate: "2027-01-15", dueTime: "16:30" } });
    await runFinalReminders(new Date("2027-01-15T13:00:00+05:30"));
    expect(sent.at(-1)!.to).toEqual(["login@example.com"]);

    expect((await open("not-the-token-at-all-0000000")).status).toBe(400);
    expect((await a(settings.GET, "GET", "/settings")).json.email).toMatchObject({ address: "login@example.com", pending: "inbox@example.com" });

    expect((await open(tokenIn(sent[0]!.text))).status).toBe(200);
    expect((await a(settings.GET, "GET", "/settings")).json.email).toEqual({ address: "inbox@example.com", pending: null, loginEmail: "login@example.com" });
    await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 2", dueDate: "2027-01-15", dueTime: "16:45" } });
    await runFinalReminders(new Date("2027-01-15T13:00:00+05:30"));
    expect(sent.at(-1)!.to).toEqual(["inbox@example.com"]);
  });

  it("refuses an expired link, and a link opened twice does nothing more", async () => {
    await a(emailSetting.PUT, "PUT", "/settings/email", { body: { email: "inbox@example.com" } });
    const token = tokenIn(sent[0]!.text);
    await pool.query(`update "user" set notify_email_expires_at = now() - interval '1 minute' where id = $1`, [studentId]);
    await open(token);
    expect((await a(settings.GET, "GET", "/settings")).json.email.address).toBe("login@example.com");
  });

  it("goes back to the login email, and refuses a bad address", async () => {
    expect((await a(emailSetting.PUT, "PUT", "/settings/email", { body: { email: "not an email" } })).status).toBe(400);
    await a(emailSetting.PUT, "PUT", "/settings/email", { body: { email: "inbox@example.com" } });
    await open(tokenIn(sent[0]!.text));
    expect((await a(emailSetting.DELETE, "DELETE", "/settings/email")).json).toEqual({ address: "login@example.com", pending: null, loginEmail: "login@example.com" });
  });
});

describe("turning alerts off (#82)", () => {
  it("records a turned-off alert in the Activity Log but doesn't email it; 'a reminder couldn't be sent' always emails", async () => {
    expect((await a(settings.PATCH, "PATCH", "/settings", { body: { alertsOff: ["ai"] } })).json.alertsOff).toEqual(["ai"]);
    expect((await a(settings.PATCH, "PATCH", "/settings", { body: { alertsOff: ["reminders"] } })).status).toBe(400);
    await raiseAlert(studentId, "ai_outage", {}, new Date());
    await raiseAlert(studentId, "final_reminder_undeliverable", { count: 1 }, new Date());
    const causes = (await pool.query("select payload->>'cause' as cause from activity_event where kind = 'alert' order by created_at")).rows.map((r) => r.cause);
    expect(causes).toEqual(["ai_outage", "final_reminder_undeliverable"]);
    expect(sent).toHaveLength(1);
  });
});

describe("the confirmation email's limits (#82 review)", () => {
  it("sends at most 3 an hour, counted in the database; the address already in use sends nothing", async () => {
    for (const n of [1, 2, 3]) expect((await a(emailSetting.PUT, "PUT", "/settings/email", { body: { email: `x${n}@example.com` } })).status).toBe(200);
    expect((await a(emailSetting.PUT, "PUT", "/settings/email", { body: { email: "x4@example.com" } })).status).toBe(429);
    expect(sent).toHaveLength(3);
    expect((await a(emailSetting.PUT, "PUT", "/settings/email", { body: { email: "LOGIN@example.com" } })).json).toMatchObject({ address: "login@example.com", pending: null });
  });
});

