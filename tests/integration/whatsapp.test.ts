// Seam: the /api/v1/whatsapp endpoints, the banner and Semester archiving against a real Postgres (#11).
import { beforeEach, describe, expect, it } from "vitest";
import * as courses from "@/app/api/v1/courses/route";
import * as dashboard from "@/app/api/v1/dashboard/route";
import * as semesterArchive from "@/app/api/v1/semesters/[id]/archive/route";
import * as semesters from "@/app/api/v1/semesters/route";
import * as groupLink from "@/app/api/v1/whatsapp/groups/[id]/link/route";
import * as pairing from "@/app/api/v1/whatsapp/pairing/route";
import * as whatsapp from "@/app/api/v1/whatsapp/route";
import { pool } from "@/server/db/client";
import { client, resetData, seedStudent } from "./api";

let a: ReturnType<typeof client>;
let b: ReturnType<typeof client>;
let me: { id: string };
let semesterId: string;
let courseId: string;
let groupId: string;

beforeEach(async () => {
  await resetData();
  const sa = await seedStudent("a@example.com");
  me = sa;
  a = client(sa.cookie);
  b = client((await seedStudent("b@example.com")).cookie);
  semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-08-03", endDate: "2026-12-18" } })).json.id;
  courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  groupId = (await pool.query("insert into wa_group (student_id, wa_jid, subject) values ($1, '1203@g.us', 'CS2010 group') returning id", [me.id])).rows[0].id;
});

const session = async () => (await pool.query("select status, pairing_phone, pairing_requested_at, unlink_requested_at, groups_reload_requested_at from wa_session where student_id = $1", [me.id])).rows[0];

describe("pairing and unlinking", () => {
  it("starts unlinked, records a pairing request for the worker, and an unlink request", async () => {
    expect((await a(whatsapp.GET, "GET", "/whatsapp")).json).toMatchObject({ status: "unlinked", pairingCode: null, lastError: null, groups: [{ id: groupId, subject: "CS2010 group", linkedCourseId: null, linkedSemesterId: null }] });
    const res = await a(pairing.POST, "POST", "/whatsapp/pairing", { body: { phone: "+94 77 123 4567" } });
    expect(res.json).toMatchObject({ status: "pairing" });
    expect(await session()).toMatchObject({ status: "pairing", pairing_phone: "94771234567", pairing_requested_at: expect.any(Date) });
    expect((await a(whatsapp.DELETE, "DELETE", "/whatsapp")).status).toBe(204);
    expect((await session()).unlink_requested_at).toBeInstanceOf(Date);
  });

  it("refuses a phone number that isn't digits with a country code", async () => {
    const res = await a(pairing.POST, "POST", "/whatsapp/pairing", { body: { phone: "0771234" } });
    expect(res.json.error.fieldErrors.phone).toBeTruthy();
  });
});

describe("group links", () => {
  it("links a group to a Course or to the Semester, asks the worker to reload, and unlinks", async () => {
    const toCourse = await a(groupLink.PUT, "PUT", `/whatsapp/groups/${groupId}/link`, { params: { id: groupId }, body: { courseId } });
    expect(toCourse.json).toMatchObject({ id: groupId, linkedCourseId: courseId, linkedSemesterId: null });
    expect((await session()).groups_reload_requested_at).toBeInstanceOf(Date);
    const toSemester = await a(groupLink.PUT, "PUT", `/whatsapp/groups/${groupId}/link`, { params: { id: groupId }, body: { semesterId } });
    expect(toSemester.json).toMatchObject({ linkedCourseId: null, linkedSemesterId: semesterId });
    expect((await a(groupLink.DELETE, "DELETE", `/whatsapp/groups/${groupId}/link`, { params: { id: groupId } })).status).toBe(204);
    expect((await a(whatsapp.GET, "GET", "/whatsapp")).json.groups[0]).toMatchObject({ linkedCourseId: null, linkedSemesterId: null });
  });

  it("refuses both links at once", async () => {
    const res = await a(groupLink.PUT, "PUT", `/whatsapp/groups/${groupId}/link`, { params: { id: groupId }, body: { courseId, semesterId } });
    expect(res.status).toBe(400);
  });

  it("answers 404 for another Student's group, Course or Semester", async () => {
    for (const res of [
      await b(groupLink.PUT, "PUT", `/whatsapp/groups/${groupId}/link`, { params: { id: groupId }, body: { semesterId } }),
      await b(groupLink.DELETE, "DELETE", `/whatsapp/groups/${groupId}/link`, { params: { id: groupId } }),
    ])
      expect(res.status).toBe(404);
    const theirs = (await pool.query("insert into wa_group (student_id, wa_jid, subject) select id, '9999@g.us', 'B group' from \"user\" where email = 'b@example.com' returning id")).rows[0].id;
    const res = await b(groupLink.PUT, "PUT", `/whatsapp/groups/${theirs}/link`, { params: { id: theirs }, body: { courseId } });
    expect(res.status).toBe(404);
    expect((await b(whatsapp.GET, "GET", "/whatsapp")).json.groups.map((g: { subject: string }) => g.subject)).toEqual(["B group"]);
  });
});

describe("the WhatsApp banner and archiving", () => {
  it("shows 'WhatsApp disconnected' after a logout", async () => {
    await a(whatsapp.GET, "GET", "/whatsapp");
    await pool.query("update wa_session set status = 'logged_out', disconnected_at = now() where student_id = $1", [me.id]);
    const banners = (await a(dashboard.GET, "GET", "/dashboard")).json.banners;
    expect(banners).toContainEqual({ kind: "whatsapp_disconnected", since: expect.stringMatching(/Z$/) });
  });

  it("erases stored message text when its Semester is archived (D1)", async () => {
    await pool.query("insert into inbox_message (student_id, wa_group_id, semester_id, wa_message_id, kind, sent_at, text_enc) values ($1, $2, $3, 'M1', 'text', now(), '\\x01'::bytea)", [me.id, groupId, semesterId]);
    await a(semesterArchive.POST, "POST", `/semesters/${semesterId}/archive`, { params: { id: semesterId } });
    expect((await pool.query("select text_enc from inbox_message")).rows).toEqual([{ text_enc: null }]);
  });
});
