// Seam: edited and deleted WhatsApp messages through the worker, with a fake AI (#13).
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as assignment from "@/app/api/v1/assignments/[id]/route";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as semesters from "@/app/api/v1/semesters/route";
import type { AiContext } from "@/server/ai/context";
import { loadKey } from "@/server/crypto";
import { pool } from "@/server/db/client";
import { aiTick } from "../../src/worker/ai/batcher";
import type { AiClient } from "../../src/worker/ai/nim-client";
import { Ingest } from "../../src/worker/whatsapp/ingest";
import { client, resetData, seedStudent } from "./api";

const GROUP = "120363000000000001@g.us";
const key = loadKey(randomBytes(32).toString("base64"));
let a: ReturnType<typeof client>;
let courseId: string;
let ingest: Ingest;
const t0 = Math.floor(Date.now() / 1000);
const later = () => new Date(Date.now() + 3 * 60_000);
const k = (id: string) => ({ remoteJid: GROUP, id, fromMe: false });

const post = (id: string, text: string, at: number) =>
  ingest.handle("messages.upsert", { type: "notify", messages: [{ key: k(id), messageTimestamp: at, pushName: "Kasun", message: { conversation: text } }] });
const edit = (id: string, text: string, at: number) =>
  ingest.handle("messages.update", [{ key: k(id), update: { message: { editedMessage: { message: { conversation: text } } }, messageTimestamp: at } }]);
const remove = (id: string) => ingest.handle("messages.delete", { keys: [k(id)] });

/** A fake AI: `reply` gets the context and returns the operations for the batch. */
let seen: AiContext[] = [];
const ai = (reply: (ctx: AiContext) => object[]): AiClient => ({
  model: "fake/model",
  complete: async (chat) => {
    const ctx = JSON.parse(chat[1]!.content) as AiContext;
    seen.push(ctx);
    const operations = reply(ctx).map((o) => ({ sourceMessageIds: ctx.messages.map((m) => m.id), ...o }));
    return { content: JSON.stringify({ messages: ctx.messages.map((m) => ({ id: m.id, decision: "applied", reason: "t" })), operations, unknownCourses: [] }), inputTokens: 1, outputTokens: 1 };
  },
});
const list = async () => (await a(assignments.GET, "GET", "/assignments")).json;
const events = async () => (await pool.query("select kind, payload from activity_event order by created_at")).rows;

beforeEach(async () => {
  await resetData();
  seen = [];
  const me = await seedStudent("a@example.com");
  a = client(me.cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-08-03", endDate: "2026-12-18" } })).json.id;
  courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  await pool.query("insert into wa_group (student_id, wa_jid, subject, linked_course_id) values ($1, $2, 'CS2010 group', $3)", [me.id, GROUP, courseId]);
  ingest = new Ingest(me.id, key);
  await ingest.reloadGroups();
});

describe("an edited message", () => {
  it("corrects a due date: the original's change is undone, then the edit applies with its own time", async () => {
    const item = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4", dueDate: "2026-11-27" } })).json;
    await post("M1", "Lab 4 moved to the 30th", t0 + 10);
    await aiTick(ai(() => [{ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-11-30" } }]), key, later());
    expect(await list()).toMatchObject([{ dueDate: "2026-11-30", version: 2 }]);

    await edit("M1", "Lab 4 moved to the 29th", t0 + 20);
    await aiTick(ai((ctx) => {
      // The AI sees the item as it was before the original, and the original's text beside the edit.
      expect(ctx.assignments).toMatchObject([{ id: item.id, dueDate: "2026-11-27" }]);
      expect(ctx.messages).toMatchObject([{ kind: "edit", text: "Lab 4 moved to the 29th", editOf: { text: "Lab 4 moved to the 30th" } }]);
      return [{ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-11-29" } }];
    }), key, later());
    expect(seen).toHaveLength(2);
    expect(await list()).toMatchObject([{ dueDate: "2026-11-29", version: 4 }]);
    const history = (await pool.query("select op, actor from entity_version where entity_id = $1 order by version", [item.id])).rows;
    expect(history).toEqual([{ op: "create", actor: "student" }, { op: "update", actor: "ai" }, { op: "undo", actor: "system" }, { op: "update", actor: "ai" }]);
    expect((await pool.query("select count(*)::int as n from suppression")).rows[0].n).toBe(0);
  });

  it("after the Student's own edit, keeps the original's change and still applies the correction", async () => {
    await post("M1", "Lab 5 due 4th Dec", t0 + 10);
    await aiTick(ai(() => [{ op: "create_assignment", courseId, title: "Lab 5", dueDate: "2026-12-04" }]), key, later());
    const [item] = await list();
    await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, title: "Lab 5 (mine)" } });

    await edit("M1", "Lab 5 due 3rd Dec", Math.floor(Date.now() / 1000) + 30);
    await aiTick(ai(() => [{ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-12-03" } }]), key, later());
    expect(await list()).toMatchObject([{ id: item.id, title: "Lab 5 (mine)", dueDate: "2026-12-03" }]);
    expect((await pool.query("select undone_at from auto_change order by created_at limit 1")).rows[0].undone_at).toBeNull();
  });
});

describe("a deleted message", () => {
  it("withdraws its change, with no AI call", async () => {
    await post("M1", "Lab 6 due 5th Dec", t0 + 10);
    await aiTick(ai(() => [{ op: "create_assignment", courseId, title: "Lab 6", dueDate: "2026-12-05" }]), key, later());
    await remove("M1");
    const calls = seen.length;
    await aiTick(ai(() => []), key, later());
    expect(seen).toHaveLength(calls);
    expect(await list()).toEqual([]);
    expect((await pool.query("select undone_at is not null as undone from auto_change")).rows).toEqual([{ undone: true }]);
  });

  it("then a repost brings the item back", async () => {
    await post("M1", "Lab 7 due 6th Dec", t0 + 10);
    await aiTick(ai(() => [{ op: "create_assignment", courseId, title: "Lab 7", dueDate: "2026-12-06" }]), key, later());
    await remove("M1");
    await post("M2", "Lab 7 due 6th Dec", t0 + 40);
    await aiTick(ai((ctx) => (expect(ctx.assignments).toEqual([]), expect(ctx.recentMessages).toEqual([]), [{ op: "create_assignment", courseId, title: "Lab 7", dueDate: "2026-12-06" }])), key, later());
    expect(await list()).toMatchObject([{ title: "Lab 7", dueDate: "2026-12-06" }]);
  });

  it("keeps the change, and says why, when the item was changed since or another message still backs it", async () => {
    await post("M1", "Lab 8 due 7th Dec", t0 + 10);
    await aiTick(ai(() => [{ op: "create_assignment", courseId, title: "Lab 8", dueDate: "2026-12-07" }]), key, later());
    const [item] = await list();
    await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, title: "Lab 8 (mine)" } });
    await remove("M1");
    await aiTick(ai(() => []), key, later());
    expect(await list()).toHaveLength(1);
    expect(await events()).toMatchObject([{ kind: "change_kept", payload: { reason: "You edited this after the change" } }]);

    // Two messages announced it; deleting one keeps it.
    await post("M2", "Lab 9 due 8th Dec", t0 + 50);
    await post("M3", "yes Lab 9 due 8th", t0 + 51);
    await aiTick(ai(() => [{ op: "create_assignment", courseId, title: "Lab 9", dueDate: "2026-12-08" }]), key, later());
    await remove("M2");
    await aiTick(ai(() => []), key, later());
    expect((await list()).map((x: { title: string }) => x.title)).toContain("Lab 9");
    expect((await events()).at(-1)).toMatchObject({ kind: "change_kept", payload: { reason: "Another message still announces it" } });
  });

  it("before the AI read it, is simply skipped", async () => {
    await post("M1", "Lab 10 due 9th Dec", t0 + 10);
    await remove("M1");
    await aiTick(ai(() => [{ op: "create_assignment", courseId, title: "Lab 10", dueDate: "2026-12-09" }]), key, later());
    expect(seen).toHaveLength(0);
    expect(await list()).toEqual([]);
  });
});
