// Seam: the /api/v1 Semester, Course and Nickname endpoints against a real Postgres (#6).
import { beforeAll, describe, expect, it } from "vitest";
import * as courseArchive from "@/app/api/v1/courses/[id]/archive/route";
import * as nicknames from "@/app/api/v1/courses/[id]/nicknames/route";
import * as course from "@/app/api/v1/courses/[id]/route";
import * as courses from "@/app/api/v1/courses/route";
import * as nickname from "@/app/api/v1/nicknames/[id]/route";
import * as semesterArchive from "@/app/api/v1/semesters/[id]/archive/route";
import * as setCurrent from "@/app/api/v1/semesters/[id]/set-current/route";
import * as semesters from "@/app/api/v1/semesters/route";
import { client, ORIGIN, resetData, seedStudent } from "./api";

let api: ReturnType<typeof client>;
let cookie: string;
const sem = { name: "Year 2 · Semester 1", startDate: "2026-08-03", endDate: "2026-12-18" };

beforeAll(async () => {
  await resetData();
  cookie = (await seedStudent("a@example.com")).cookie;
  api = client(cookie);
});

const newSemester = async (name = "S") => (await api(semesters.POST, "POST", "/semesters", { body: { ...sem, name } })).json;
const newCourse = async (semesterId: string, code = "CS2010") =>
  (await api(courses.POST, "POST", "/courses", { body: { semesterId, code, name: "Data Structures", colour: "blue" } })).json;

describe("Semesters", () => {
  it("creates a Semester; the first one becomes current", async () => {
    const res = await api(semesters.POST, "POST", "/semesters", { body: sem });
    expect(res.status).toBe(201);
    expect(res.json).toMatchObject({ ...sem, isCurrent: true, archivedAt: null, version: 1 });
    expect(res.json.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps exactly one current Semester", async () => {
    const second = await newSemester("Year 2 · Semester 2");
    expect(second.isCurrent).toBe(false);
    expect((await api(setCurrent.POST, "POST", `/semesters/${second.id}/set-current`, { params: { id: second.id } })).json.isCurrent).toBe(true);
    const list = (await api(semesters.GET, "GET", "/semesters")).json;
    expect(list.filter((s: { isCurrent: boolean }) => s.isCurrent).map((s: { id: string }) => s.id)).toEqual([second.id]);
  });

  it("archives a Semester, which stops it being current and can't be made current again", async () => {
    const s = await newSemester("Old");
    await api(setCurrent.POST, "POST", `/semesters/${s.id}/set-current`, { params: { id: s.id } });
    const archived = await api(semesterArchive.POST, "POST", `/semesters/${s.id}/archive`, { params: { id: s.id } });
    expect(archived.json).toMatchObject({ isCurrent: false });
    expect(archived.json.archivedAt).toMatch(/Z$/);
    const again = await api(setCurrent.POST, "POST", `/semesters/${s.id}/set-current`, { params: { id: s.id } });
    expect(again.status).toBe(400);
  });

  it("rejects an end date before the start date, naming the field", async () => {
    const res = await api(semesters.POST, "POST", "/semesters", { body: { ...sem, endDate: "2026-08-01" } });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatchObject({ code: "VALIDATION", fieldErrors: { endDate: expect.any(String) } });
    expect(res.json.error.requestId).toBeTruthy();
  });
});

describe("Courses", () => {
  it("adds, edits and archives a Course", async () => {
    const s = await newSemester();
    const created = await api(courses.POST, "POST", "/courses", { body: { semesterId: s.id, code: "CS2010", name: "Data Structures", lecturerName: "Dr. Perera", colour: "blue" } });
    expect(created.status).toBe(201);
    expect(created.json).toMatchObject({ semesterId: s.id, code: "CS2010", lecturerName: "Dr. Perera", colour: "blue", archivedAt: null, nicknames: [] });
    const id = created.json.id;

    const edited = await api(course.PATCH, "PATCH", `/courses/${id}`, { params: { id }, body: { name: "Data Structures & Algorithms", colour: "violet", lecturerName: null } });
    expect(edited.json).toMatchObject({ name: "Data Structures & Algorithms", colour: "violet", lecturerName: null, code: "CS2010" });

    const archived = await api(courseArchive.POST, "POST", `/courses/${id}/archive`, { params: { id } });
    expect(archived.json.archivedAt).toMatch(/Z$/);
  });

  it("refuses a second Course with the same code in a Semester, ignoring case", async () => {
    const s = await newSemester();
    await newCourse(s.id, "MA2001");
    const dup = await api(courses.POST, "POST", "/courses", { body: { semesterId: s.id, code: "ma2001", name: "Stats", colour: "pink" } });
    expect(dup.status).toBe(400);
    expect(dup.json.error.fieldErrors.code).toBeTruthy();
  });

  it("lists Courses for one Semester", async () => {
    const a = await newSemester("A");
    const b = await newSemester("B");
    await newCourse(a.id, "A1");
    await newCourse(b.id, "B1");
    const list = (await api(courses.GET, "GET", "/courses", { query: { semesterId: a.id } })).json;
    expect(list.map((c: { code: string }) => c.code)).toEqual(["A1"]);
  });

  it("deletes a Course only when its code is typed, and takes its Nicknames with it", async () => {
    const s = await newSemester();
    const c = await newCourse(s.id, "CS2020");
    const nick = (await api(nicknames.POST, "POST", `/courses/${c.id}/nicknames`, { params: { id: c.id }, body: { nickname: "DB" } })).json;

    const wrong = await api(course.DELETE, "DELETE", `/courses/${c.id}`, { params: { id: c.id }, query: { confirmCode: "CS2010" } });
    expect(wrong.status).toBe(400);
    expect(wrong.json.error.fieldErrors.confirmCode).toBeTruthy();

    const ok = await api(course.DELETE, "DELETE", `/courses/${c.id}`, { params: { id: c.id }, query: { confirmCode: "cs2020" } });
    expect(ok.status).toBe(204);
    expect((await api(course.GET, "GET", `/courses/${c.id}`, { params: { id: c.id } })).status).toBe(404);
    expect((await api(nickname.DELETE, "DELETE", `/nicknames/${nick.id}`, { params: { id: nick.id } })).status).toBe(404);
  });
});

describe("Nicknames", () => {
  it("stores them lowercase, unique per Course, and removes them", async () => {
    const s = await newSemester();
    const c = await newCourse(s.id);
    const add = (n: string) => api(nicknames.POST, "POST", `/courses/${c.id}/nicknames`, { params: { id: c.id }, body: { nickname: n } });

    const first = await add("  Data Structures ");
    expect(first.status).toBe(201);
    expect(first.json).toMatchObject({ nickname: "data structures" });
    const dup = await add("DATA STRUCTURES");
    expect(dup.status).toBe(400);
    expect(dup.json.error.fieldErrors.nickname).toBeTruthy();

    expect((await api(course.GET, "GET", `/courses/${c.id}`, { params: { id: c.id } })).json.nicknames).toEqual([{ id: first.json.id, nickname: "data structures" }]);
    expect((await api(nickname.DELETE, "DELETE", `/nicknames/${first.json.id}`, { params: { id: first.json.id } })).status).toBe(204);
    expect((await api(course.GET, "GET", `/courses/${c.id}`, { params: { id: c.id } })).json.nicknames).toEqual([]);
  });
});

describe("the request wrapper", () => {
  it("answers 401 without a session, 403 for a write from another origin, and 404 for a malformed id", async () => {
    expect((await api(semesters.GET, "GET", "/semesters", { cookie: null })).json.error.code).toBe("UNAUTHENTICATED");
    const foreign = await api(semesters.POST, "POST", "/semesters", { body: sem, origin: "https://evil.example" });
    expect(foreign).toMatchObject({ status: 403, json: { error: { code: "FORBIDDEN_ORIGIN" } } });
    expect((await api(course.GET, "GET", "/courses/not-a-uuid", { params: { id: "not-a-uuid" } })).status).toBe(404);
  });

  it("rejects unknown fields and malformed JSON as VALIDATION", async () => {
    const extra = await api(semesters.POST, "POST", "/semesters", { body: { ...sem, isCurrent: true } });
    expect(extra.status).toBe(400);
    const bad = await semesters.POST(new Request(`${ORIGIN}/api/v1/semesters`, { method: "POST", headers: { cookie, origin: ORIGIN }, body: "{" }), {});
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("VALIDATION");
  });
});
