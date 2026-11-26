// Seam: Settings → Dashboard (#84, U47): the settings API and the dashboard data that follows them.
import { beforeEach, describe, expect, it } from "vitest";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as semesters from "@/app/api/v1/semesters/route";
import * as settings from "@/app/api/v1/settings/route";
import { getDashboard } from "@/server/data/dashboard";
import { addDays, todayIn } from "@/server/domain/time";
import { client, resetData, seedStudent } from "./api";

let a: ReturnType<typeof client>;
let studentId: string;
beforeEach(async () => {
  await resetData();
  const me = await seedStudent("dash@example.com");
  studentId = me.id;
  a = client(me.cookie);
});
const save = (dashboard: object) => a(settings.PATCH, "PATCH", "/settings", { body: { dashboard } });

describe("dashboard settings (#84)", () => {
  it("start at 14 days and today's order, save, and refuse hiding Overdue or bad values", async () => {
    expect((await a(settings.GET, "GET", "/settings")).json.dashboard).toEqual({ dueSoonDays: 14, order: ["overdue", "today", "dueSoon", "tbaExams", "checkThese", "recent"], hidden: [] });
    expect((await save({ dueSoonDays: 7, order: ["dueSoon", "overdue"], hidden: ["recent"] })).json.dashboard).toMatchObject({ dueSoonDays: 7, order: ["dueSoon", "overdue"], hidden: ["recent"] });
    expect(await save({ hidden: ["overdue"] })).toMatchObject({ status: 400, json: { error: { fieldErrors: { hidden: "Overdue can't be hidden" } } } });
    expect((await save({ dueSoonDays: 2 })).status).toBe(400);
    expect((await save({ order: ["weather"] })).status).toBe(400);
  });

  it("the dashboard follows the range and the order", async () => {
    const today = todayIn();
    const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: addDays(today, -30), endDate: addDays(today, 60) } })).json.id;
    const courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
    for (const n of [2, 10]) await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: `In ${n}`, dueDate: addDays(today, n) } });
    expect((await getDashboard(studentId)).upcoming.map((d) => d.item.title)).toEqual(["In 2", "In 10"]);
    await save({ dueSoonDays: 5, order: ["recent", "dueSoon"], hidden: ["today"] });
    const d = await getDashboard(studentId);
    expect(d.upcoming.map((x) => x.item.title)).toEqual(["In 2"]);
    expect(d).toMatchObject({ dueSoonDays: 5, sections: ["recent", "dueSoon", "overdue", "tbaExams", "checkThese"] });
  });
});
