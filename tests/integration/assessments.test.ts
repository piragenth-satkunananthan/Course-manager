// Seam: the Assignment, Exam and dashboard endpoints against a real Postgres (#7).
import { beforeAll, describe, expect, it } from "vitest";
import * as assignmentStatus from "@/app/api/v1/assignments/[id]/status/route";
import * as assignment from "@/app/api/v1/assignments/[id]/route";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courseArchive from "@/app/api/v1/courses/[id]/archive/route";
import * as courses from "@/app/api/v1/courses/route";
import * as dashboard from "@/app/api/v1/dashboard/route";
import * as exam from "@/app/api/v1/exams/[id]/route";
import * as exams from "@/app/api/v1/exams/route";
import * as semesters from "@/app/api/v1/semesters/route";
import { writeEntity } from "@/server/data/write-entity";
import { db, pool } from "@/server/db/client";
import { addDays, todayIn } from "@/server/domain/time";
import { client, resetData, seedStudent } from "./api";

let a: ReturnType<typeof client>;
let b: ReturnType<typeof client>;
let courseId: string;
const today = todayIn();
const day = (n: number) => addDays(today, n);

// History isn't exposed by the API until the Activity Log (#12), so these read entity_version directly.
const history = async (entityId: string) =>
  (await pool.query("select op, version, actor, before, after from entity_version where entity_id = $1 order by created_at", [entityId])).rows;

beforeAll(async () => {
  await resetData();
  a = client((await seedStudent("a@example.com")).cookie);
  b = client((await seedStudent("b@example.com")).cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: day(-60), endDate: day(60) } })).json.id;
  courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
});

const newAssignment = async (body: Record<string, unknown> = {}) =>
  (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4 report", dueDate: day(3), ...body } })).json;

describe("Assignments", () => {
  it("creates one with no announced time as due 23:59 Colombo, added by the Student, with a history row", async () => {
    const res = await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4 report", dueDate: "2026-11-20", dueTime: "" } });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({
      courseCode: "CS2010", courseColour: "blue", title: "Lab 4 report", dueDate: "2026-11-20", dueTime: null, timeAnnounced: false,
      dueAt: "2026-11-20T18:29:00.000Z", status: "todo", submittedAt: null, isGroupWork: false, source: "manual", version: 1,
    });
    expect(await history(res.json.id)).toMatchObject([{ op: "create", version: 1, actor: "student", before: null, after: { title: "Lab 4 report" } }]);
  });

  it("updates with the current version, bumping it and recording before and after", async () => {
    const item = await newAssignment();
    const res = await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, dueTime: "16:30" } });
    expect(res.json).toMatchObject({ dueTime: "16:30", timeAnnounced: true, version: 2 });
    expect((await history(item.id)).at(-1)).toMatchObject({ op: "update", version: 2, before: { dueTime: null }, after: { dueTime: "16:30" } });
  });

  it("skips a write that changes nothing: no new version, no history", async () => {
    const item = await newAssignment();
    const res = await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, title: "Lab 4 report" } });
    expect(res.json.version).toBe(1);
    expect(await history(item.id)).toHaveLength(1);
  });

  it("answers a stale expectedVersion with 409 and the current values", async () => {
    const item = await newAssignment();
    await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, title: "Changed elsewhere" } });
    const res = await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, title: "Mine" } });
    expect(res.status).toBe(409);
    expect(res.json.error).toMatchObject({ code: "CONFLICT", current: { title: "Changed elsewhere", version: 2 } });
  });

  it("records a status change in history without bumping the version", async () => {
    const item = await newAssignment();
    const res = await a(assignmentStatus.PUT, "PUT", `/assignments/${item.id}/status`, { params: { id: item.id }, body: { status: "submitted" } });
    expect(res.json).toMatchObject({ status: "submitted", version: 1 });
    expect(res.json.submittedAt).toMatch(/Z$/);
    expect((await history(item.id)).at(-1)).toMatchObject({ op: "status", version: 1, before: { status: "todo" }, after: { status: "submitted" } });
    const back = await a(assignmentStatus.PUT, "PUT", `/assignments/${item.id}/status`, { params: { id: item.id }, body: { status: "in_progress" } });
    expect(back.json).toMatchObject({ status: "in_progress", submittedAt: null });
  });

  it("soft-deletes with the current version, and refuses a stale one", async () => {
    const item = await newAssignment();
    const stale = await a(assignment.DELETE, "DELETE", `/assignments/${item.id}`, { params: { id: item.id }, query: { expectedVersion: "7" } });
    expect(stale.status).toBe(409);
    const res = await a(assignment.DELETE, "DELETE", `/assignments/${item.id}`, { params: { id: item.id }, query: { expectedVersion: "1" } });
    expect(res.status).toBe(204);
    expect((await a(assignments.GET, "GET", "/assignments")).json.map((x: { id: string }) => x.id)).not.toContain(item.id);
    expect((await history(item.id)).at(-1)).toMatchObject({ op: "delete", version: 2, before: { deletedAt: null }, after: { deletedAt: expect.stringMatching(/Z$/) } });
    const again = await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 2, title: "x" } });
    expect(again.status).toBe(404);
  });

  it("filters the list by due date", async () => {
    const early = await newAssignment({ title: "Early", dueDate: day(40) });
    const late = await newAssignment({ title: "Late", dueDate: day(45) });
    const ids = (await a(assignments.GET, "GET", "/assignments", { query: { from: day(39), to: day(41) } })).json.map((x: { id: string }) => x.id);
    expect(ids).toContain(early.id);
    expect(ids).not.toContain(late.id);
  });

  it("validates times and names the field", async () => {
    const res = await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "x", dueDate: day(1), dueTime: "25:00" } });
    expect(res).toMatchObject({ status: 400, json: { error: { code: "VALIDATION", fieldErrors: { dueTime: expect.any(String) } } } });
  });
});

describe("Exams", () => {
  it("can be TBA, then get a date and time", async () => {
    const created = await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Mid-term", kindLabel: "mid-term", date: "" } });
    expect(created.json).toMatchObject({ date: null, startTime: null, dueAt: null, version: 1 });
    const dated = await a(exam.PATCH, "PATCH", `/exams/${created.json.id}`, { params: { id: created.json.id }, body: { expectedVersion: 1, date: "2026-12-01", startTime: "09:00" } });
    expect(dated.json).toMatchObject({ date: "2026-12-01", startTime: "09:00", dueAt: "2026-12-01T03:30:00.000Z", version: 2 });
  });

  it("refuses a start time without a date", async () => {
    const res = await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Quiz", startTime: "09:00" } });
    expect(res.json.error.fieldErrors.startTime).toBeTruthy();
  });

  it("refuses an edit that would leave a time without a date, and changes nothing", async () => {
    const e = (await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Lab test", date: day(6), startTime: "10:00" } })).json;
    const res = await a(exam.PATCH, "PATCH", `/exams/${e.id}`, { params: { id: e.id }, body: { expectedVersion: 1, date: "" } });
    expect(res).toMatchObject({ status: 400, json: { error: { fieldErrors: { startTime: expect.any(String) } } } });
    const after = (await a(exams.GET, "GET", "/exams", { query: { courseId } })).json.find((x: { id: string }) => x.id === e.id);
    expect(after).toMatchObject({ date: day(6), startTime: "10:00", version: 1 });
  });

  it("deletes with the current version", async () => {
    const e = (await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Viva", date: day(5) } })).json;
    expect((await a(exam.DELETE, "DELETE", `/exams/${e.id}`, { params: { id: e.id }, query: { expectedVersion: "1" } })).status).toBe(204);
  });
});

describe("another Student", () => {
  it("gets 404 for every id of A's, and sees none of A's items", async () => {
    const item = await newAssignment();
    const e = (await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Quiz" } })).json;
    const calls = [
      b(assignments.POST, "POST", "/assignments", { body: { courseId, title: "x", dueDate: day(1) } }),
      b(assignments.GET, "GET", "/assignments", { query: { courseId } }),
      b(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, title: "hijack" } }),
      b(assignment.DELETE, "DELETE", `/assignments/${item.id}`, { params: { id: item.id }, query: { expectedVersion: "1" } }),
      b(assignmentStatus.PUT, "PUT", `/assignments/${item.id}/status`, { params: { id: item.id }, body: { status: "submitted" } }),
      b(exams.POST, "POST", "/exams", { body: { courseId, title: "x" } }),
      b(exams.GET, "GET", "/exams", { query: { courseId } }),
      b(exam.PATCH, "PATCH", `/exams/${e.id}`, { params: { id: e.id }, body: { expectedVersion: 1, title: "hijack" } }),
      b(exam.DELETE, "DELETE", `/exams/${e.id}`, { params: { id: e.id }, query: { expectedVersion: "1" } }),
    ];
    for (const res of await Promise.all(calls)) expect(res).toMatchObject({ status: 404, json: { error: { code: "NOT_FOUND" } } });
    expect((await b(assignments.GET, "GET", "/assignments")).json).toEqual([]);
    expect((await b(dashboard.GET, "GET", "/dashboard")).json).toMatchObject({ overdue: [], upcoming: [], tbaExams: [] });
    expect((await a(assignments.GET, "GET", "/assignments", { query: { courseId } })).json.find((x: { id: string }) => x.id === item.id)).toMatchObject({ title: "Lab 4 report", status: "todo" });
  });
});

describe("the dashboard", () => {
  it("shows Overdue first, the next 14 days, and TBA Exams apart; submitted work drops out", async () => {
    await resetData();
    a = client((await seedStudent("a@example.com")).cookie);
    const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: day(-60), endDate: day(60) } })).json.id;
    courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;

    const overdue = await newAssignment({ title: "Overdue", dueDate: day(-2) });
    const soon = await newAssignment({ title: "Soon", dueDate: day(3) });
    await newAssignment({ title: "Too far", dueDate: day(20) });
    const done = await newAssignment({ title: "Done", dueDate: day(2) });
    await a(assignmentStatus.PUT, "PUT", `/assignments/${done.id}/status`, { params: { id: done.id }, body: { status: "submitted" } });
    const examSoon = (await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Quiz", date: day(5), startTime: "09:00" } })).json;
    const tba = (await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Final" } })).json;

    const d = (await a(dashboard.GET, "GET", "/dashboard")).json;
    expect(d.overdue.map((x: { item: { id: string } }) => x.item.id)).toEqual([overdue.id]);
    expect(d.upcoming.map((x: { type: string; item: { id: string } }) => [x.type, x.item.id])).toEqual([["assignment", soon.id], ["exam", examSoon.id]]);
    expect(d.tbaExams.map((x: { id: string }) => x.id)).toEqual([tba.id]);
    expect(d).toMatchObject({ todaySessions: [], highlightedChanges: [], recentAutoChanges: [], banners: [] });
  });

  it("lists an Exam with a date but no time on its day, and drops archived Courses", async () => {
    const untimed = (await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Viva", date: day(0) } })).json;
    expect((await a(dashboard.GET, "GET", "/dashboard")).json.upcoming.map((x: { item: { id: string } }) => x.item.id)).toContain(untimed.id);
    await a(courseArchive.POST, "POST", `/courses/${courseId}/archive`, { params: { id: courseId } });
    expect((await a(dashboard.GET, "GET", "/dashboard")).json).toMatchObject({ overdue: [], upcoming: [], tbaExams: [] });
  });
});

describe("the shared write path, as the AI will use it (#12)", () => {
  it("creates an item marked as from the AI, and keeps the AI off fields it doesn't own", async () => {
    await resetData();
    const me = await seedStudent("ai@example.com");
    a = client(me.cookie);
    const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: day(-60), endDate: day(60) } })).json.id;
    const c1 = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "C1", name: "One", colour: "blue" } })).json.id;
    const c2 = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "C2", name: "Two", colour: "pink" } })).json.id;
    const sentAt = new Date().toISOString();

    const { row } = await db.transaction((tx) =>
      writeEntity(tx, { studentId: me.id, entityType: "assignment", op: "create", actor: "ai", setAt: sentAt, proposed: { courseId: c1, title: "Lab 5", dueDate: day(4) } }),
    );
    expect(row).toMatchObject({ courseId: c1, source: "ai" });

    const moved = await db.transaction((tx) =>
      writeEntity(tx, { studentId: me.id, entityType: "assignment", op: "update", entityId: row.id, actor: "ai", setAt: new Date().toISOString(), proposed: { courseId: c2 }, toDto: async () => null }),
    );
    expect(moved).toMatchObject({ noChange: true, row: { courseId: c1 } });
  });
});
