// Seam: the scheduler tick's heartbeat and alerts, and the dashboard banner, with fake healthchecks.io and Resend (#10).
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as dashboard from "@/app/api/v1/dashboard/route";
import * as semesters from "@/app/api/v1/semesters/route";
import { pool } from "@/server/db/client";
import { tick } from "../../src/worker/scheduler/tick";
import { client, resetData, seedStudent } from "./api";

let pings = 0;
let emails: { subject: string }[] = [];
let failEmails = false;
let server: Server;
let a: ReturnType<typeof client>;

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (req.url === "/ping/reminders") return void (pings++, res.end("OK"));
      if (failEmails) return void res.writeHead(500, { "content-type": "application/json" }).end('{"message":"down"}');
      emails.push(JSON.parse(body));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `m${emails.length}` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  Object.assign(process.env, { EMAIL_API_BASE_URL: base, RESEND_API_KEY: "re_test", HEALTHCHECK_REMINDERS_URL: `${base}/ping/reminders` });
});
afterAll(() => new Promise((r) => server.close(r)));

beforeEach(async () => {
  pings = 0;
  emails = [];
  failEmails = false;
  await resetData();
  await pool.query("truncate health_signal");
  a = client((await seedStudent("student@example.com")).cookie);
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
