// Seam: Class Session, Session Change and timetable endpoints against a real Postgres (#8).
import { beforeAll, describe, expect, it } from "vitest";
import * as classSession from "@/app/api/v1/class-sessions/[id]/route";
import * as classSessions from "@/app/api/v1/courses/[id]/class-sessions/route";
import * as courses from "@/app/api/v1/courses/route";
import * as dashboard from "@/app/api/v1/dashboard/route";
import * as semesters from "@/app/api/v1/semesters/route";
import * as change from "@/app/api/v1/session-changes/[id]/route";
import * as changes from "@/app/api/v1/session-changes/route";
import * as timetable from "@/app/api/v1/timetable/route";
import { pool } from "@/server/db/client";
import { addDays, todayIn, weekdayOf } from "@/server/domain/time";
import { client, resetData, seedStudent } from "./api";

let a: ReturnType<typeof client>;
let b: ReturnType<typeof client>;
let courseId: string;
let lectureId: string; // Thursdays 10:00–12:00, Semester Mon 2 – Fri 27 Nov 2026

const week = async (monday: string, who = a) =>
  (await who(timetable.GET, "GET", "/timetable", { query: { week: monday } })).json as { date: string; startTime: string; status: string; sessionChangeId: string | null; classSessionId: string | null }[];
const post = (body: object, who = a) => who(changes.POST, "POST", "/session-changes", { body });

beforeAll(async () => {
  await resetData();
  a = client((await seedStudent("a@example.com")).cookie);
  b = client((await seedStudent("b@example.com")).cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-11-02", endDate: "2026-11-27" } })).json.id;
  courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  const res = await a(classSessions.POST, "POST", `/courses/${courseId}/class-sessions`, { params: { id: courseId }, body: { kind: "lecture", weekday: 4, startTime: "10:00", endTime: "12:00", location: "B2" } });
  expect(res.status).toBe(201);
  expect(res.json).toMatchObject({ courseId, kind: "lecture", weekday: 4, startTime: "10:00", endTime: "12:00", location: "B2" });
  lectureId = res.json.id;
});

describe("Class Sessions", () => {
  it("reject an end before the start, including after a partial edit", async () => {
    const bad = await a(classSessions.POST, "POST", `/courses/${courseId}/class-sessions`, { params: { id: courseId }, body: { kind: "lab", weekday: 1, startTime: "14:00", endTime: "13:00" } });
    expect(bad.json.error.fieldErrors.endTime).toBeTruthy();
    const partial = await a(classSession.PATCH, "PATCH", `/class-sessions/${lectureId}`, { params: { id: lectureId }, body: { startTime: "13:00" } });
    expect(partial).toMatchObject({ status: 400, json: { error: { fieldErrors: { endTime: expect.any(String) } } } });
  });

  it("repeat weekly between the Semester's dates", async () => {
    expect((await week("2026-11-09")).map((o) => [o.date, o.startTime, o.status])).toEqual([["2026-11-12", "10:00", "normal"]]);
    expect(await week("2026-11-30")).toEqual([]);
  });
});

describe("Session Changes", () => {
  it("cancel one occurrence, with a history row", async () => {
    const res = await post({ kind: "cancel", classSessionId: lectureId, date: "2026-11-12" });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ kind: "cancel", classSessionId: lectureId, originalDate: "2026-11-12", version: 1 });
    expect((await week("2026-11-09"))[0]).toMatchObject({ status: "cancelled", sessionChangeId: res.json.id });
    const h = await pool.query("select op from entity_version where entity_id = $1", [res.json.id]);
    expect(h.rows).toEqual([{ op: "create" }]);
  });

  it("answer a second change for the same occurrence with 409, the existing id and its current values", async () => {
    const existing = (await week("2026-11-09"))[0]!.sessionChangeId;
    const res = await post({ kind: "reschedule", classSessionId: lectureId, date: "2026-11-12", newDate: "2026-11-13", newStart: "14:00", newEnd: "16:00" });
    expect(res).toMatchObject({ status: 409, json: { error: { code: "CONFLICT", existingId: existing, current: { id: existing, kind: "cancel", version: 1 } } } });
  });

  it("turn the cancel into a reschedule with PATCH, and refuse a stale version", async () => {
    const id = (await week("2026-11-09"))[0]!.sessionChangeId!;
    const res = await a(change.PATCH, "PATCH", `/session-changes/${id}`, { params: { id }, body: { expectedVersion: 1, kind: "reschedule", newDate: "2026-11-13", newStart: "14:00", newEnd: "16:00" } });
    expect(res.json).toMatchObject({ kind: "reschedule", newDate: "2026-11-13", newStartTime: "14:00", newEndTime: "16:00", version: 2 });
    expect((await week("2026-11-09")).map((o) => [o.date, o.startTime, o.status])).toEqual([["2026-11-13", "14:00", "rescheduled"]]);
    const stale = await a(change.PATCH, "PATCH", `/session-changes/${id}`, { params: { id }, body: { expectedVersion: 1, newStart: "15:00", newEnd: "16:00" } });
    expect(stale).toMatchObject({ status: 409, json: { error: { code: "CONFLICT", current: { version: 2 } } } });
  });

  it("refuse a reschedule left without a new date and time", async () => {
    const c = (await post({ kind: "cancel", classSessionId: lectureId, date: "2026-11-19" })).json;
    const res = await a(change.PATCH, "PATCH", `/session-changes/${c.id}`, { params: { id: c.id }, body: { expectedVersion: 1, kind: "reschedule" } });
    expect(res).toMatchObject({ status: 400, json: { error: { code: "VALIDATION" } } });
  });

  it("refuse an edit that moves a change outside the Semester", async () => {
    const c = (await post({ kind: "cancel", classSessionId: lectureId, date: "2026-11-26" })).json;
    const res = await a(change.PATCH, "PATCH", `/session-changes/${c.id}`, { params: { id: c.id }, body: { expectedVersion: 1, kind: "reschedule", newDate: "2026-12-03", newStart: "10:00", newEnd: "12:00" } });
    expect(res).toMatchObject({ status: 400, json: { error: { fieldErrors: { newDate: expect.any(String) } } } });
    await a(change.DELETE, "DELETE", `/session-changes/${c.id}`, { params: { id: c.id }, query: { expectedVersion: "1" } });
  });

  it("refuse a date that isn't one of the class's occurrences", async () => {
    const res = await post({ kind: "cancel", classSessionId: lectureId, date: "2026-11-11" }); // a Wednesday
    expect(res.json.error.fieldErrors.date).toBeTruthy();
    const outside = await post({ kind: "extra", courseId, sessionKind: "tutorial", date: "2026-12-10", start: "08:00", end: "09:00" });
    expect(outside.json.error.fieldErrors.date).toBeTruthy();
  });

  it("add an extra session", async () => {
    const res = await post({ kind: "extra", courseId, sessionKind: "tutorial", date: "2026-11-24", start: "08:00", end: "09:00", location: "T1" });
    expect(res.json).toMatchObject({ kind: "extra", classSessionId: null, sessionKind: "tutorial", newDate: "2026-11-24" });
    expect((await week("2026-11-23")).map((o) => [o.date, o.status, o.classSessionId])).toEqual([["2026-11-24", "extra", null], ["2026-11-26", "normal", lectureId]]);
  });

  it("remove a change with the current version, after which a new change is allowed", async () => {
    const id = (await week("2026-11-16")).find((o) => o.date === "2026-11-19")!.sessionChangeId!;
    expect((await a(change.DELETE, "DELETE", `/session-changes/${id}`, { params: { id }, query: { expectedVersion: "1" } })).status).toBe(204);
    expect((await week("2026-11-16")).map((o) => o.status)).toEqual(["normal"]);
    expect((await post({ kind: "cancel", classSessionId: lectureId, date: "2026-11-19" })).status).toBe(201);
  });
});

describe("another Student", () => {
  it("gets 404 for every id of A's, and sees none of A's timetable", async () => {
    const c = (await post({ kind: "cancel", classSessionId: lectureId, date: "2026-11-05" })).json;
    const calls = [
      b(classSessions.POST, "POST", `/courses/${courseId}/class-sessions`, { params: { id: courseId }, body: { kind: "lab", weekday: 1, startTime: "14:00", endTime: "16:00" } }),
      b(classSession.PATCH, "PATCH", `/class-sessions/${lectureId}`, { params: { id: lectureId }, body: { location: "x" } }),
      b(classSession.DELETE, "DELETE", `/class-sessions/${lectureId}`, { params: { id: lectureId } }),
      post({ kind: "cancel", classSessionId: lectureId, date: "2026-11-26" }, b),
      post({ kind: "extra", courseId, sessionKind: "lab", date: "2026-11-25", start: "08:00", end: "09:00" }, b),
      b(change.PATCH, "PATCH", `/session-changes/${c.id}`, { params: { id: c.id }, body: { expectedVersion: 1, kind: "cancel" } }),
      b(change.DELETE, "DELETE", `/session-changes/${c.id}`, { params: { id: c.id }, query: { expectedVersion: "1" } }),
    ];
    for (const res of await Promise.all(calls)) expect(res).toMatchObject({ status: 404, json: { error: { code: "NOT_FOUND" } } });
    expect(await week("2026-11-02", b)).toEqual([]);
  });
});

describe("deleting a Class Session", () => {
  it("removes its occurrences and its changes", async () => {
    expect((await a(classSession.DELETE, "DELETE", `/class-sessions/${lectureId}`, { params: { id: lectureId } })).status).toBe(204);
    expect((await week("2026-11-02")).filter((o) => o.classSessionId)).toEqual([]);
    expect((await pool.query("select count(*)::int as n from session_change where class_session_id = $1", [lectureId])).rows[0].n).toBe(0);
  });
});

describe("the dashboard", () => {
  it("lists today's classes", async () => {
    const today = todayIn();
    const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "Now", startDate: addDays(today, -7), endDate: addDays(today, 7) } })).json.id;
    const cid = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "NOW1", name: "Now", colour: "pink" } })).json.id;
    await a(classSessions.POST, "POST", `/courses/${cid}/class-sessions`, { params: { id: cid }, body: { kind: "lab", weekday: weekdayOf(today), startTime: "00:00", endTime: "23:59" } });
    const d = (await a(dashboard.GET, "GET", "/dashboard")).json;
    // only this Course's: another test seeds a class on a fixed date, which may be today
    expect(d.todaySessions.filter((s: { courseCode: string }) => s.courseCode === "NOW1")).toMatchObject([{ courseCode: "NOW1", date: today, kind: "lab", status: "normal" }]);
  });
});
