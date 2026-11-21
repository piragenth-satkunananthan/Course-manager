// Seam: the scheduler tick with an injected clock and a fake email server (#9).
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as assignmentStatus from "@/app/api/v1/assignments/[id]/status/route";
import * as assignment from "@/app/api/v1/assignments/[id]/route";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as exams from "@/app/api/v1/exams/route";
import * as semesters from "@/app/api/v1/semesters/route";
import { pool } from "@/server/db/client";
import { runDigest, runFinalReminders } from "../../src/worker/scheduler/jobs";
import { client, resetData, seedStudent } from "./api";

// A fake Resend: records every request; `failNext` makes the next calls answer 500.
type Sent = { idempotencyKey: string; to: string[]; subject: string; text: string };
let sent: Sent[] = [];
let failNext = 0;
let server: Server;

let a: ReturnType<typeof client>;
let courseId: string;
// Fri 15 Jan 2027 in Colombo (UTC+05:30)
const at = (localTime: string, date = "2027-01-15") => new Date(`${date}T${localTime}:00+05:30`);

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (failNext > 0) {
        failNext--;
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ message: "down" }));
        return;
      }
      sent.push({ idempotencyKey: String(req.headers["idempotency-key"]), ...JSON.parse(body) });
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ id: `msg-${sent.length}` }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as { port: number };
  Object.assign(process.env, { EMAIL_API_BASE_URL: `http://127.0.0.1:${port}`, RESEND_API_KEY: "re_test" });
});
afterAll(() => new Promise((r) => server.close(r)));

beforeEach(async () => {
  sent = [];
  failNext = 0;
  await resetData();
  a = client((await seedStudent("student@example.com")).cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-12-01", endDate: "2027-03-31" } })).json.id;
  courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
});

const newAssignment = async (body: object) => (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4 report", ...body } })).json;
const logRows = async () => (await pool.query("select kind, status, digest_date::text as digest_date, error from email_log order by created_at")).rows;

describe("Final Reminders", () => {
  it("sends one, 4 hours ahead, to the Student, with the log id as the idempotency key; the next tick sends nothing", async () => {
    await newAssignment({ dueDate: "2027-01-15", dueTime: "16:30" });
    await runFinalReminders(at("12:00")); // 4 h 30 before: not yet
    expect(sent).toHaveLength(0);
    await runFinalReminders(at("12:31")); // inside the window (created inside it counts too)
    expect(sent).toMatchObject([{ to: ["student@example.com"], subject: "Due in 4 hours: Lab 4 report (CS2010)" }]);
    const [row] = (await pool.query("select id, status from email_log")).rows;
    expect(row).toMatchObject({ status: "sent" });
    expect(sent[0]!.idempotencyKey).toBe(`${row.id}:1`);
    await runFinalReminders(at("13:00"));
    expect(sent).toHaveLength(1);
  });

  it("sends a new one when the Deadline moves", async () => {
    const item = await newAssignment({ dueDate: "2027-01-15", dueTime: "16:30" });
    await runFinalReminders(at("13:00"));
    await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, dueTime: "18:00" } });
    await runFinalReminders(at("14:01"));
    expect(sent).toHaveLength(2);
  });

  it("leaves out submitted work and Exams with no time, and treats an untimed Assignment as due at 23:59", async () => {
    const done = await newAssignment({ title: "Done", dueDate: "2027-01-15", dueTime: "16:30" });
    await a(assignmentStatus.PUT, "PUT", `/assignments/${done.id}/status`, { params: { id: done.id }, body: { status: "submitted" } });
    await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Viva", date: "2027-01-15" } });
    await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Quiz", date: "2027-01-15", startTime: "16:00" } });
    await newAssignment({ title: "Untimed", dueDate: "2027-01-15" });
    await runFinalReminders(at("13:00"));
    expect(sent.map((s) => s.subject)).toEqual(["Due in 4 hours: Quiz (CS2010)"]);
    await runFinalReminders(at("20:00"));
    expect(sent.map((s) => s.subject)).toContain("Due in 4 hours: Untimed (CS2010)");
  });

  it("retries a failed send on later ticks until the due instant, then stops", async () => {
    await newAssignment({ dueDate: "2027-01-15", dueTime: "16:30" });
    failNext = 1;
    await runFinalReminders(at("13:00"));
    expect(await logRows()).toMatchObject([{ status: "failed", error: "HTTP 500: down" }]);
    await runFinalReminders(at("13:01"));
    expect(sent).toHaveLength(1);
    expect(await logRows()).toMatchObject([{ status: "sent" }]);

    await newAssignment({ title: "Late", dueDate: "2027-01-15", dueTime: "17:00" });
    failNext = 100;
    await runFinalReminders(at("16:00"));
    failNext = 0;
    await runFinalReminders(at("17:01")); // past its due instant: given up
    expect(sent).toHaveLength(1);
  });
});

describe("the Daily Digest", () => {
  it("is sent once, only between 07:00 and 09:00, with Due soon and Added or moved", async () => {
    await newAssignment({ title: "Today", dueDate: "2027-01-15", dueTime: "16:30" });
    await newAssignment({ title: "Day after", dueDate: "2027-01-17" });
    await newAssignment({ title: "Next week", dueDate: "2027-01-22" });
    await runDigest(at("06:59"));
    await runDigest(at("09:00"));
    expect(sent).toHaveLength(0);

    await runDigest(at("07:30"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toMatch(/Due soon\nFri 15 Jan\n- Assignment: CS2010 · Today · Fri 15 Jan, 16:30\nSun 17 Jan\n- Assignment: CS2010 · Day after · Sun 17 Jan, time not announced/);
    expect(sent[0]!.text).toMatch(/Added or moved\n(- .*\n)*- Assignment: CS2010 · Next week/);
    await runDigest(at("08:30"));
    expect(sent).toHaveLength(1);
  });

  it("keeps its Added or moved items when a failed send is retried, with a new idempotency key", async () => {
    await newAssignment({ title: "Fresh", dueDate: "2027-01-26" });
    failNext = 1;
    await runDigest(at("07:00"));
    expect(sent).toHaveLength(0);
    await runDigest(at("07:01"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Fresh");
    expect(sent[0]!.idempotencyKey).toMatch(/:2$/);
  });

  it("sends only one under concurrent ticks", async () => {
    await newAssignment({ dueDate: "2027-01-16" });
    await Promise.all([runDigest(at("07:00")), runDigest(at("07:00")), runDigest(at("07:00"))]);
    expect(sent).toHaveLength(1);
    expect(await logRows()).toMatchObject([{ kind: "digest", status: "sent", digest_date: "2027-01-15" }]);
  });

  it("lists only what changed since the previous digest", async () => {
    await newAssignment({ title: "Old news", dueDate: "2027-01-25" });
    await runDigest(at("07:00", "2027-01-14"));
    await newAssignment({ title: "Fresh", dueDate: "2027-01-26" });
    await runDigest(at("07:00"));
    expect(sent).toHaveLength(2);
    expect(sent[1]!.text).toContain("Fresh");
    expect(sent[1]!.text).not.toContain("Old news");
  });

  it("records a day with nothing to report as skipped, and sends nothing", async () => {
    await runDigest(at("07:00"));
    expect(sent).toHaveLength(0);
    expect(await logRows()).toMatchObject([{ kind: "digest", status: "skipped", digest_date: "2027-01-15" }]);
  });
});

describe("the worker process", () => {
  const startWorker = () =>
    spawn("npx", ["tsx", "src/worker/main.ts"], { env: { ...process.env, RESEND_API_KEY: "" }, stdio: ["ignore", "pipe", "pipe"] });
  const exited = (p: ReturnType<typeof startWorker>) => new Promise<number | null>((r) => p.on("exit", (code) => r(code)));
  const started = (p: ReturnType<typeof startWorker>) =>
    new Promise<void>((r) => p.stdout!.on("data", (d: Buffer) => d.toString().includes("worker started") && r()));

  it("runs once: a second instance exits, and losing the lock connection exits the first", async () => {
    const first = startWorker();
    await started(first);
    const second = startWorker();
    expect(await exited(second)).toBe(1);

    const firstExit = exited(first);
    await pool.query("select pg_terminate_backend(pid) from pg_locks where locktype = 'advisory' and pid <> pg_backend_pid()");
    expect(await firstExit).toBe(1);
  }, 60_000);
});
