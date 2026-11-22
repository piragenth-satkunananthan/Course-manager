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
import { pool } from "@/server/db/client";
import { client, ORIGIN, resetData, seedStudent } from "./api";

let api: ReturnType<typeof client>;
let cookie: string;
let studentId: string;
const sem = { name: "Year 2 · Semester 1", startDate: "2026-08-03", endDate: "2026-12-18" };

beforeAll(async () => {
  await resetData();
  const me = await seedStudent("a@example.com");
  cookie = me.cookie;
  studentId = me.id;
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

  it("survives two tabs setting different Semesters current at the same moment", async () => {
    const [x, y] = [await newSemester("X"), await newSemester("Y")];
    const results = await Promise.all([x, y, x, y].map((s) => api(setCurrent.POST, "POST", `/semesters/${s.id}/set-current`, { params: { id: s.id } })));
    expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200]);
    const current = (await api(semesters.GET, "GET", "/semesters")).json.filter((s: { isCurrent: boolean }) => s.isCurrent);
    expect(current).toHaveLength(1);
  });

  it("moves the Class Group to the Semester set as current, and asks the worker to reload (#28)", async () => {
    const [oldSem, newSem] = [await newSemester("Y2S1"), await newSemester("Y2S2")];
    await api(setCurrent.POST, "POST", `/semesters/${oldSem.id}/set-current`, { params: { id: oldSem.id } });
    await pool.query("insert into wa_group (student_id, wa_jid, subject, linked_semester_id) values ($1, 'class@g.us', 'Batch 22/23', $2)", [studentId, oldSem.id]);
    await pool.query("insert into wa_session (student_id) values ($1) on conflict (student_id) do update set groups_reload_requested_at = null", [studentId]);

    await api(setCurrent.POST, "POST", `/semesters/${newSem.id}/set-current`, { params: { id: newSem.id } });
    const g = (await pool.query("select linked_semester_id from wa_group where wa_jid = 'class@g.us'")).rows[0];
    expect(g.linked_semester_id).toBe(newSem.id);
    const s = (await pool.query("select groups_reload_requested_at from wa_session where student_id = $1", [studentId])).rows[0];
    expect(s?.groups_reload_requested_at).toBeTruthy();
  });

  it("keeps the first archive time when archived twice", async () => {
    const s = await newSemester("Twice");
    const first = (await api(semesterArchive.POST, "POST", `/semesters/${s.id}/archive`, { params: { id: s.id } })).json.archivedAt;
    const second = (await api(semesterArchive.POST, "POST", `/semesters/${s.id}/archive`, { params: { id: s.id } })).json.archivedAt;
    expect(second).toBe(first);
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

describe("Practical Courses (#26)", () => {
  const patch = (id: string, body: unknown) => api(course.PATCH, "PATCH", `/courses/${id}`, { params: { id }, body });
  const fieldError = (res: { status: number; json: { error: { fieldErrors: Record<string, unknown> } } }) => {
    expect(res.status).toBe(400);
    return res.json.error.fieldErrors.practicalOfCourseId;
  };

  it("creates a Practical Course of a theory Course, then clears it", async () => {
    const s = await newSemester();
    const theory = await newCourse(s.id, "SWT22022");
    const res = await api(courses.POST, "POST", "/courses", {
      body: { semesterId: s.id, code: "SWT22032", name: "IAD Practical", colour: "blue", practicalOfCourseId: theory.id },
    });
    expect(res.status).toBe(201);
    expect(res.json.practicalOfCourseId).toBe(theory.id);
    expect(theory.practicalOfCourseId).toBeNull();
    expect((await patch(res.json.id, { practicalOfCourseId: null })).json.practicalOfCourseId).toBeNull();
  });

  it("refuses itself, another Semester, a Practical Course, a second practical, and a theory Course becoming a practical", async () => {
    const s = await newSemester();
    const theory = await newCourse(s.id, "T1");
    const practical = await newCourse(s.id, "P1");
    const other = await newCourse(s.id, "P2");
    const elsewhere = await newCourse((await newSemester("Other")).id, "T9");
    expect((await patch(practical.id, { practicalOfCourseId: theory.id })).status).toBe(200);

    expect(fieldError(await patch(other.id, { practicalOfCourseId: other.id }))).toBeTruthy();
    expect(fieldError(await patch(other.id, { practicalOfCourseId: elsewhere.id }))).toBeTruthy();
    expect(fieldError(await patch(other.id, { practicalOfCourseId: practical.id }))).toBeTruthy();
    expect(fieldError(await patch(other.id, { practicalOfCourseId: theory.id }))).toBeTruthy();
    expect(fieldError(await patch(theory.id, { practicalOfCourseId: other.id }))).toBeTruthy();
  });

  it("refuses an archived theory Course, but keeps an existing link to one", async () => {
    const s = await newSemester();
    const theory = await newCourse(s.id, "T3");
    const practical = await newCourse(s.id, "P4");
    const late = await newCourse(s.id, "P5");
    await patch(practical.id, { practicalOfCourseId: theory.id });
    await api(courseArchive.POST, "POST", `/courses/${theory.id}/archive`, { params: { id: theory.id } });
    expect((await patch(practical.id, { practicalOfCourseId: theory.id, name: "Renamed" })).status).toBe(200);
    await patch(practical.id, { practicalOfCourseId: null });
    expect(fieldError(await patch(late.id, { practicalOfCourseId: theory.id }))).toBe("That Course is archived");
  });

  it("clears the link when the theory Course is deleted", async () => {
    const s = await newSemester();
    const theory = await newCourse(s.id, "T2");
    const practical = await newCourse(s.id, "P3");
    await patch(practical.id, { practicalOfCourseId: theory.id });
    await api(course.DELETE, "DELETE", `/courses/${theory.id}`, { params: { id: theory.id }, query: { confirmCode: "T2" } });
    expect((await api(course.GET, "GET", `/courses/${practical.id}`, { params: { id: practical.id } })).json.practicalOfCourseId).toBeNull();
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
