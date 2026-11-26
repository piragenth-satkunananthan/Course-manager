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
import * as settings from "@/app/api/v1/settings/route";
import { encrypt, loadKey } from "@/server/crypto";
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
let studentId: string;
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
  const me = await seedStudent("student@example.com");
  studentId = me.id;
  a = client(me.cookie);
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
    await runFinalReminders(at("17:01")); // past its due instant: given up, with an alert instead
    expect(sent.map((s) => s.subject)).toEqual(["Due in 4 hours: Lab 4 report (CS2010)", "Course-manager needs you: a Final Reminder couldn't be sent"]);
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

  it("adds Check these (#14): risky changes and Possibly Missed messages since the last digest, open Unknown Courses, and paused", async () => {
    const q = (sql: string, params: unknown[] = []) => pool.query(sql, params);
    const group = (await q("insert into wa_group (student_id, wa_jid, subject, linked_course_id) values ($1, 'g@g.us', 'CS2010 group', $2) returning id", [studentId, courseId])).rows[0].id;
    const batch = (await q("insert into ai_batch (student_id, wa_group_id) values ($1, $2) returning id", [studentId, group])).rows[0].id;
    const message = (text: string, flagged: boolean) =>
      q("insert into inbox_message (student_id, wa_group_id, wa_message_id, kind, sender_name, sent_at, text_enc, possibly_missed, possibly_missed_at, status) values ($1, $2, $3, 'text', 'Kasun', now(), $4, $5, case when $5 then now() end, 'done')", [
        studentId, group, text, encrypt(text, loadKey()), flagged,
      ]);
    await message("Group B lab cancelled", true);
    await message("thanks all", false);
    await q("insert into auto_change (student_id, batch_id, entity_type, entity_id, op, after_version, summary, risk) values ($1, $2, 'assignment', gen_random_uuid(), 'delete', 2, 'Quiz 2 cancelled', 'cancelled'), ($1, $2, 'assignment', gen_random_uuid(), 'create', 1, 'Lab 5: due Mon 18 Jan', 'normal')", [studentId, batch]);
    await q("insert into unknown_course_mention (student_id, name, name_key) values ($1, 'ENG', 'eng'), ($1, 'Old', 'old')", [studentId]);
    await q("update unknown_course_mention set status = 'ignored' where name = 'Old'");
    await q("update \"user\" set auto_changes_paused = true");

    await runDigest(at("07:00", "2027-01-14"));
    expect(sent[0]!.text).toContain("Check these");
    expect(sent[0]!.text).toContain("Cancelled: Quiz 2 cancelled");
    expect(sent[0]!.text).toContain('Possibly missed, Kasun in CS2010 group: "Group B lab cancelled"');
    expect(sent[0]!.text).toContain('Unknown Course "ENG"');
    expect(sent[0]!.text).toContain("Auto Changes are paused");
    expect(sent[0]!.text).toContain("/activity");
    expect(sent[0]!.text).not.toMatch(/thanks all|Lab 5|"Old"/);

    // The next day: what was already reported isn't repeated; the open Unknown Course still is.
    await runDigest(at("07:00"));
    expect(sent[1]!.text).toContain('Unknown Course "ENG"');
    expect(sent[1]!.text).not.toMatch(/Quiz 2|Group B/);
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

describe("notification settings (#79, U44)", () => {
  const save = (body: object) => a(settings.PATCH, "PATCH", "/settings", { body });

  it("start at today's behaviour, save, and refuse bad or clashing values", async () => {
    expect((await a(settings.GET, "GET", "/settings")).json).toEqual({
      autoChangesPaused: false,
      notify: { digestOn: true, digestTime: "07:00", digestDays: 2, reminderHours: 4, secondReminderHours: null, quietStart: null, quietEnd: null },
    });
    expect((await save({ notify: { digestTime: "06:30", reminderHours: 8 } })).json.notify).toMatchObject({ digestTime: "06:30", reminderHours: 8, digestDays: 2 });
    expect((await save({ notify: { reminderHours: 3 } })).status).toBe(400);
    expect((await save({ notify: { digestTime: "04:00" } })).status).toBe(400); // before 05:00
    const clash = await save({ notify: { quietStart: "06:00", quietEnd: "08:00" } });
    expect(clash).toMatchObject({ status: 400, json: { error: { fieldErrors: { digestTime: "The digest can't be sent during quiet hours" } } } });
    expect((await a(settings.GET, "GET", "/settings")).json.notify).toMatchObject({ quietStart: null, digestTime: "06:30" }); // nothing saved
  });

  it("send the digest at the chosen time with the chosen range, and not at all when it's off", async () => {
    await newAssignment({ title: "In 4 days", dueDate: "2027-01-19" });
    await save({ notify: { digestTime: "09:30", digestDays: 4 } });
    await runDigest(at("07:00"));
    expect(sent).toEqual([]);
    await runDigest(at("09:30"));
    expect(sent.map((m) => m.text)).toEqual([expect.stringContaining("In 4 days")]);
    await save({ notify: { digestOn: false } });
    await runDigest(at("09:30", "2027-01-16"));
    expect(sent).toHaveLength(1);
  });

  it("send the Final Reminder at the chosen lead time and a second reminder once", async () => {
    await save({ notify: { reminderHours: 1, secondReminderHours: 24 } });
    await newAssignment({ dueDate: "2027-01-16", dueTime: "12:00" });
    await runFinalReminders(at("12:00"));
    await runFinalReminders(at("12:05"));
    await runFinalReminders(at("10:30", "2027-01-16"));
    expect(sent.map((m) => m.subject)).toEqual(["Due in 1 day: Lab 4 report (CS2010)"]);
    await runFinalReminders(at("11:00", "2027-01-16"));
    await runFinalReminders(at("11:01", "2027-01-16"));
    expect(sent.map((m) => m.subject)).toEqual(["Due in 1 day: Lab 4 report (CS2010)", "Due in 1 hour: Lab 4 report (CS2010)"]);
  });

  it("bring a reminder that would fall in quiet hours forward to their start", async () => {
    await save({ notify: { quietStart: "22:00", quietEnd: "06:00" } });
    await newAssignment({ dueDate: "2027-01-16", dueTime: "03:00" }); // 4 h before is 23:00, inside quiet hours
    await runFinalReminders(at("21:59"));
    expect(sent).toEqual([]);
    await runFinalReminders(at("22:00"));
    expect(sent.map((m) => m.subject)).toEqual(["Due in 5 hours: Lab 4 report (CS2010)"]);
  });
});
