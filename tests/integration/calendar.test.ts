// Seam: the month endpoint (#20) against Postgres: 6 Monday-to-Sunday weeks, grouped by local day in Asia/Colombo.
import { beforeAll, describe, expect, it } from "vitest";
import * as assignments from "@/app/api/v1/assignments/route";
import * as calendar from "@/app/api/v1/calendar/route";
import * as classSessions from "@/app/api/v1/courses/[id]/class-sessions/route";
import * as courses from "@/app/api/v1/courses/route";
import * as exams from "@/app/api/v1/exams/route";
import * as semesters from "@/app/api/v1/semesters/route";
import * as changes from "@/app/api/v1/session-changes/route";
import { client, resetData, seedStudent } from "./api";

let a: ReturnType<typeof client>;
let b: ReturnType<typeof client>;
type Day = { date: string; occurrences: { date: string; status: string; startTime: string }[]; deadlines: { type: string; item: { title: string } }[] };
const month = async (m: string, who = a) => who(calendar.GET, "GET", "/calendar", { query: { month: m } });
const on = (days: Day[], date: string) => days.find((d) => d.date === date)!;

beforeAll(async () => {
  await resetData();
  a = client((await seedStudent("a@example.com")).cookie);
  b = client((await seedStudent("b@example.com")).cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-11-02", endDate: "2026-11-27" } })).json.id;
  const courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  const lecture = (await a(classSessions.POST, "POST", `/courses/${courseId}/class-sessions`, { params: { id: courseId }, body: { kind: "lecture", weekday: 4, startTime: "10:00", endTime: "12:00" } })).json.id; // Thursdays
  await a(changes.POST, "POST", "/session-changes", { body: { kind: "reschedule", classSessionId: lecture, date: "2026-11-12", newDate: "2026-11-13", newStart: "14:00", newEnd: "16:00" } });
  await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4", dueDate: "2026-11-20" } }); // no time: 23:59
  await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Quiz 2", date: "2026-11-25", startTime: "09:00" } });
  await a(changes.POST, "POST", "/session-changes", { body: { kind: "extra", courseId, sessionKind: "lab", date: "2026-11-21", start: "09:00", end: "11:00" } }); // a Saturday
  await a(exams.POST, "POST", "/exams", { body: { courseId, title: "Final", kindLabel: "exam" } }); // TBA: left out
});

describe("the month (#20)", () => {
  it("covers 6 weeks from the Monday on or before the 1st, including the padding days", async () => {
    const res = await month("2026-11");
    expect(res.status).toBe(200);
    expect(res.json.month).toBe("2026-11");
    const days = res.json.days as Day[];
    expect(days).toHaveLength(42);
    expect([days[0]!.date, days.at(-1)!.date]).toEqual(["2026-10-26", "2026-12-06"]); // 1 Nov 2026 is a Sunday
  });

  it("puts an Occurrence, a rescheduled Occurrence, an Assignment due at 23:59 and an Exam on their own days; TBA Exams are left out", async () => {
    const days = (await month("2026-11")).json.days as Day[];
    expect(on(days, "2026-11-05").occurrences).toMatchObject([{ status: "normal", startTime: "10:00" }]);
    expect(on(days, "2026-11-12").occurrences).toEqual([]); // moved away
    expect(on(days, "2026-11-13").occurrences).toMatchObject([{ status: "rescheduled", startTime: "14:00" }]);
    expect(on(days, "2026-11-20").deadlines).toMatchObject([{ type: "assignment", item: { title: "Lab 4" } }]);
    expect(on(days, "2026-11-21").deadlines).toEqual([]); // 23:59 Colombo is still the 20th
    expect(on(days, "2026-11-25").deadlines).toMatchObject([{ type: "exam", item: { title: "Quiz 2" } }]);
    expect(days.flatMap((d) => d.deadlines).map((d) => d.item.title)).not.toContain("Final");
    expect(on(days, "2026-11-21").occurrences).toMatchObject([{ status: "extra", startTime: "09:00" }]);
    expect(on(days, "2026-11-30").occurrences).toEqual([]); // after the Semester's end, no classes
  });

  it("shows another Student nothing, and refuses a month that isn't YYYY-MM", async () => {
    expect(((await month("2026-11", b)).json.days as Day[]).flatMap((d) => [...d.occurrences, ...d.deadlines])).toEqual([]);
    expect((await month("2026-13")).status).toBe(400);
    expect((await month("Nov")).status).toBe(400);
  });
});
