// Seam: the scheduler tick's heartbeat and alerts, and the dashboard banner, with fake healthchecks.io and Resend (#10).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as dashboard from "@/app/api/v1/dashboard/route";
import * as semesters from "@/app/api/v1/semesters/route";
import * as settings from "@/app/api/v1/settings/route";
import { pool } from "@/server/db/client";
import { tick } from "../../src/worker/scheduler/tick";
import { client, resetData, seedStudent } from "./api";

let pings = 0;
let capturePings = 0;
let emails: { subject: string }[] = [];
let failEmails = false;
let server: Server;
let a: ReturnType<typeof client>;
let studentId: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/ping/reminders") return void (pings++, res.end("OK"));
      if (req.url === "/ping/capture") return void (capturePings++, res.end("OK"));
      if (failEmails) return void res.writeHead(500, { "content-type": "application/json" }).end('{"message":"down"}');
      emails.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `m${emails.length}` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  Object.assign(process.env, { EMAIL_API_BASE_URL: base, RESEND_API_KEY: "re_test", HEALTHCHECK_REMINDERS_URL: `${base}/ping/reminders`, HEALTHCHECK_CAPTURE_URL: `${base}/ping/capture` });
});
afterAll(() => new Promise((r) => server.close(r)));

beforeEach(async () => {
  pings = 0;
  capturePings = 0;
  emails = [];
  failEmails = false;
  await resetData();
  await pool.query("truncate health_signal");
  const me = await seedStudent("student@example.com");
  studentId = me.id;
  a = client(me.cookie);
});

describe("the reminders heartbeat", () => {
  it("pings while the scheduler and email are healthy, and stops while email is failing", async () => {
    await tick(new Date());
    expect(pings).toBe(1);
    await pool.query("insert into health_signal (component, last_error_at) values ('email', now()) on conflict (component) do update set last_error_at = now()");
    await tick(new Date());
    expect(pings).toBe(1);
  });
});

describe("the worker banner", () => {
  it("shows when the scheduler hasn't ticked for 3 minutes, and clears after a tick", async () => {
    await pool.query("insert into health_signal (component, last_ok_at) values ('scheduler', now() - interval '10 minutes')");
    expect((await a(dashboard.GET, "GET", "/dashboard")).json.banners).toMatchObject([{ kind: "worker_unhealthy" }]);
    await tick(new Date());
    expect((await a(dashboard.GET, "GET", "/dashboard")).json.banners).toEqual([]);
  });
});

describe("direct alerts", () => {
  it("emails once when a Final Reminder failed until its due instant, stores an Activity event, and repeats only after 12 hours", async () => {
    const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-12-01", endDate: "2027-03-31" } })).json.id;
    const courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
    await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab", dueDate: "2027-01-15", dueTime: "16:30" } });

    failEmails = true;
    await tick(new Date("2027-01-15T14:00:00+05:30")); // the reminder fails
    failEmails = false;
    await tick(new Date("2027-01-15T16:31:00+05:30")); // past due: give up and alert
    await tick(new Date("2027-01-15T16:40:00+05:30")); // same cause within 12 h: no second email
    expect(emails.map((e) => e.subject)).toEqual(["Course-manager needs you: a Final Reminder couldn't be sent"]);
    const events = (await pool.query("select kind, payload from activity_event")).rows;
    expect(events).toMatchObject([{ kind: "alert", payload: { cause: "final_reminder_undeliverable", count: 1 } }]);

    await tick(new Date("2027-01-16T05:00:00+05:30")); // 12 h later, still within the day: alerted again
    expect(emails).toHaveLength(2);
  });
});

describe("pausing Auto Changes and the capture heartbeat (#15)", () => {
  const banners = async () => (await a(dashboard.GET, "GET", "/dashboard")).json.banners.map((b: { kind: string }) => b.kind);
  const healthy = () =>
    pool.query("insert into health_signal (component, last_ok_at) values ('scheduler', now()), ('wa_socket', now()), ('ai', now()) on conflict (component) do update set last_ok_at = now(), last_error_at = null");
  const waiting = async (minutes: number) => {
    const group = (await pool.query("insert into wa_group (student_id, wa_jid, subject) values ($1, 'g@g.us', 'G') returning id", [studentId])).rows[0].id;
    await pool.query("insert into inbox_message (student_id, wa_group_id, wa_message_id, kind, sent_at, received_at) values ($1, $2, 'm1', 'text', now(), now() - make_interval(mins => $3))", [studentId, group, minutes]);
  };

  it("Settings reads and switches the pause; it's the Student's own and validated", async () => {
    expect((await a(settings.GET, "GET", "/settings")).json).toMatchObject({ autoChangesPaused: false });
    expect((await a(settings.PATCH, "PATCH", "/settings", { body: { autoChangesPaused: true } })).json).toMatchObject({ autoChangesPaused: true });
    expect((await a(settings.PATCH, "PATCH", "/settings", { body: { autoChangesPaused: "yes" } })).status).toBe(400);
    const b = client((await seedStudent("b@example.com")).cookie);
    expect((await b(settings.GET, "GET", "/settings")).json).toMatchObject({ autoChangesPaused: false });
  });

  it("while paused: the paused banner shows, and capture keeps pinging however long messages wait", async () => {
    await healthy();
    await waiting(45);
    await tick(new Date());
    expect(capturePings).toBe(0); // a message waiting 45 minutes: the AI is unhealthy
    expect(await banners()).toEqual(["ai_unavailable"]);

    await a(settings.PATCH, "PATCH", "/settings", { body: { autoChangesPaused: true } });
    await tick(new Date());
    expect(capturePings).toBe(1);
    expect(await banners()).toEqual(["auto_changes_paused"]);

    await a(settings.PATCH, "PATCH", "/settings", { body: { autoChangesPaused: false } });
    expect(await banners()).toEqual(["ai_unavailable"]);
  });

  it("pings capture only while WhatsApp and the AI are healthy", async () => {
    await healthy();
    await tick(new Date());
    expect(capturePings).toBe(1);
    await pool.query("update health_signal set last_error_at = now() + interval '1 second' where component = 'wa_socket'");
    await tick(new Date());
    expect(capturePings).toBe(1);
  });
});
