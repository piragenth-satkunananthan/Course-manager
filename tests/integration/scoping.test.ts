// Seam: two seeded Students; every endpoint answers 404 for the other Student's ids (#6, design §6).
import { beforeAll, describe, expect, it } from "vitest";
import * as courseArchive from "@/app/api/v1/courses/[id]/archive/route";
import * as nicknames from "@/app/api/v1/courses/[id]/nicknames/route";
import * as course from "@/app/api/v1/courses/[id]/route";
import * as courses from "@/app/api/v1/courses/route";
import * as nickname from "@/app/api/v1/nicknames/[id]/route";
import * as semesterArchive from "@/app/api/v1/semesters/[id]/archive/route";
import * as setCurrent from "@/app/api/v1/semesters/[id]/set-current/route";
import * as semesters from "@/app/api/v1/semesters/route";
import { client, resetData, seedStudent } from "./api";

let a: ReturnType<typeof client>;
let b: ReturnType<typeof client>;
let mine: { semesterId: string; courseId: string; nicknameId: string };

beforeAll(async () => {
  await resetData();
  a = client((await seedStudent("a@example.com")).cookie);
  b = client((await seedStudent("b@example.com")).cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "A's", startDate: "2026-08-03", endDate: "2026-12-18" } })).json.id;
  const courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  const nicknameId = (await a(nicknames.POST, "POST", `/courses/${courseId}/nicknames`, { params: { id: courseId }, body: { nickname: "ds" } })).json.id;
  mine = { semesterId, courseId, nicknameId };
});

describe("another Student", () => {
  it("gets 404 from every endpoint that takes A's ids", async () => {
    const { semesterId, courseId, nicknameId } = mine;
    const calls = [
      b(setCurrent.POST, "POST", `/semesters/${semesterId}/set-current`, { params: { id: semesterId } }),
      b(semesterArchive.POST, "POST", `/semesters/${semesterId}/archive`, { params: { id: semesterId } }),
      b(courses.GET, "GET", "/courses", { query: { semesterId } }),
      b(courses.POST, "POST", "/courses", { body: { semesterId, code: "X1", name: "X", colour: "blue" } }),
      b(course.GET, "GET", `/courses/${courseId}`, { params: { id: courseId } }),
      b(course.PATCH, "PATCH", `/courses/${courseId}`, { params: { id: courseId }, body: { name: "hijacked" } }),
      b(course.DELETE, "DELETE", `/courses/${courseId}`, { params: { id: courseId }, query: { confirmCode: "CS2010" } }),
      b(courseArchive.POST, "POST", `/courses/${courseId}/archive`, { params: { id: courseId } }),
      b(nicknames.POST, "POST", `/courses/${courseId}/nicknames`, { params: { id: courseId }, body: { nickname: "x" } }),
      b(nickname.DELETE, "DELETE", `/nicknames/${nicknameId}`, { params: { id: nicknameId } }),
    ];
    for (const res of await Promise.all(calls)) expect(res).toMatchObject({ status: 404, json: { error: { code: "NOT_FOUND" } } });
  });

  it("sees none of A's data in its lists", async () => {
    expect((await b(semesters.GET, "GET", "/semesters")).json).toEqual([]);
    expect((await b(courses.GET, "GET", "/courses")).json).toEqual([]);
  });

  it("left A's data untouched", async () => {
    const c = (await a(course.GET, "GET", `/courses/${mine.courseId}`, { params: { id: mine.courseId } })).json;
    expect(c).toMatchObject({ name: "DS", archivedAt: null, nicknames: [{ id: mine.nicknameId, nickname: "ds" }] });
    const s = (await a(semesters.GET, "GET", "/semesters")).json;
    expect(s).toMatchObject([{ id: mine.semesterId, isCurrent: true, archivedAt: null }]);
  });
});
