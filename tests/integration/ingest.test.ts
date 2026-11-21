// Seam: the worker's WhatsApp event entry point against a real Postgres, with synthetic Baileys events (#11).
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as courses from "@/app/api/v1/courses/route";
import * as semesters from "@/app/api/v1/semesters/route";
import { decrypt, loadKey } from "@/server/crypto";
import { pool } from "@/server/db/client";
import { Ingest } from "../../src/worker/whatsapp/ingest";
import { client, resetData, seedStudent } from "./api";

const COURSE_GROUP = "120363000000000001@g.us";
const CLASS_GROUP = "120363000000000002@g.us";
const FAMILY = "120363000000000999@g.us";
const key = loadKey(randomBytes(32).toString("base64"));
let ingest: Ingest;
let semesterId: string;

const msg = (id: string, jid: string, text: string | null, extra: Record<string, unknown> = {}) => ({
  key: { remoteJid: jid, id, fromMe: false, participant: "94770000001@s.whatsapp.net" },
  messageTimestamp: 1763700000,
  pushName: "Kavin",
  message: text === null ? { imageMessage: {} } : { conversation: text },
  ...extra,
});
const rows = async () =>
  (await pool.query("select wa_message_id, kind, status, decision, semester_id, sender_name, extract(epoch from sent_at)::int as sent, edit_of is not null as has_original, revoked_at is not null as revoked, text_enc from inbox_message order by received_at, wa_message_id")).rows;

beforeEach(async () => {
  await resetData();
  const me = await seedStudent("a@example.com");
  const a = client(me.cookie);
  semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-08-03", endDate: "2026-12-18" } })).json.id;
  const courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  await pool.query(
    `insert into wa_group (student_id, wa_jid, subject, linked_course_id, linked_semester_id) values
     ($1, $2, 'CS2010 group', $4, null), ($1, $3, 'Batch 22', null, $5), ($1, $6, 'Family', null, null)`,
    [me.id, COURSE_GROUP, CLASS_GROUP, courseId, semesterId, FAMILY],
  );
  ingest = new Ingest(me.id, key);
  await ingest.reloadGroups();
});

describe("ingest", () => {
  it("stores text from linked groups, new and offline-delivered, encrypted, pending, with the Semester and sent time", async () => {
    await ingest.handle("messages.upsert", { type: "notify", messages: [msg("A1", COURSE_GROUP, "Lab 4 due Friday 4.30")] });
    await ingest.handle("messages.upsert", { type: "append", messages: [msg("A2", CLASS_GROUP, "Lecture moved to 3pm")] });
    const r = await rows();
    expect(r).toMatchObject([
      { wa_message_id: "A1", kind: "text", status: "pending", semester_id: semesterId, sender_name: "Kavin", sent: 1763700000 },
      { wa_message_id: "A2", kind: "text", status: "pending", semester_id: semesterId },
    ]);
    expect(r[0].text_enc.toString("utf8")).not.toContain("Lab 4");
    expect(decrypt(r[0].text_enc, key)).toBe("Lab 4 due Friday 4.30");
  });

  it("ignores unlinked chats and the Student's own messages, and stores nothing from them", async () => {
    await ingest.handle("messages.upsert", {
      type: "notify",
      messages: [msg("F1", FAMILY, "dinner at 8"), msg("D1", "94771112222@s.whatsapp.net", "hi"), msg("O1", COURSE_GROUP, "mine", { key: { remoteJid: COURSE_GROUP, id: "O1", fromMe: true } })],
    });
    expect(await rows()).toEqual([]);
    expect(ingest.shouldIgnoreJid(FAMILY)).toBe(true);
    expect(ingest.shouldIgnoreJid(COURSE_GROUP)).toBe(false);
  });

  it("skips duplicates", async () => {
    const m = msg("A1", COURSE_GROUP, "Lab 4 due Friday");
    await ingest.handle("messages.upsert", { type: "notify", messages: [m] });
    await ingest.handle("messages.upsert", { type: "append", messages: [m] });
    expect(await rows()).toHaveLength(1);
  });

  it("stores messages that aren't text as done and ignored, with no text", async () => {
    await ingest.handle("messages.upsert", { type: "notify", messages: [msg("I1", COURSE_GROUP, null)] });
    expect(await rows()).toMatchObject([{ wa_message_id: "I1", kind: "other", status: "done", decision: "ignored", text_enc: null }]);
  });

  it("stores an edit as its own row with the edit's time, linked to the original", async () => {
    await ingest.handle("messages.upsert", { type: "notify", messages: [msg("A1", COURSE_GROUP, "due Friday")] });
    await ingest.handle("messages.update", [
      { key: { remoteJid: COURSE_GROUP, id: "A1", fromMe: false }, update: { message: { editedMessage: { message: { conversation: "sorry, due Thursday" } } }, messageTimestamp: 1763709999 } },
    ]);
    const edit = (await rows()).find((r) => r.kind === "edit");
    expect(edit).toMatchObject({ wa_message_id: "A1:edit:1763709999", status: "pending", sent: 1763709999, has_original: true });
    expect(decrypt(edit.text_enc, key)).toBe("sorry, due Thursday");
  });

  it("stores a delete in either event form as a revoke row linked to the original, and marks the original", async () => {
    await ingest.handle("messages.upsert", { type: "notify", messages: [msg("A1", COURSE_GROUP, "x"), msg("A2", COURSE_GROUP, "y")] });
    await ingest.handle("messages.update", [{ key: { remoteJid: COURSE_GROUP, id: "A1", fromMe: false }, update: { message: null, messageStubType: 1 } }]);
    await ingest.handle("messages.delete", { keys: [{ remoteJid: COURSE_GROUP, id: "A2", fromMe: false }] });
    const r = await rows();
    expect(r.filter((x) => x.kind === "revoke").map((x) => [x.wa_message_id, x.status, x.has_original, x.text_enc])).toEqual([
      ["A1:revoke", "pending", true, null],
      ["A2:revoke", "pending", true, null],
    ]);
    expect(r.filter((x) => x.kind === "text").map((x) => x.revoked)).toEqual([true, true]);
  });

  it("follows link changes after a reload", async () => {
    await pool.query("update wa_group set linked_course_id = null where wa_jid = $1", [COURSE_GROUP]);
    await ingest.reloadGroups();
    expect(ingest.shouldIgnoreJid(COURSE_GROUP)).toBe(true);
    await ingest.handle("messages.upsert", { type: "notify", messages: [msg("A9", COURSE_GROUP, "x")] });
    expect(await rows()).toEqual([]);
  });
});
