// Seam: the Activity Log, Undo and the dashboard's Auto Change sections against a real Postgres (#12).
import { beforeEach, describe, expect, it } from "vitest";
import * as activity from "@/app/api/v1/activity/route";
import * as assignment from "@/app/api/v1/assignments/[id]/route";
import * as assignments from "@/app/api/v1/assignments/route";
import * as undo from "@/app/api/v1/auto-changes/[id]/undo/route";
import * as courses from "@/app/api/v1/courses/route";
import * as dashboard from "@/app/api/v1/dashboard/route";
import * as semesters from "@/app/api/v1/semesters/route";
import type { AiContext } from "@/server/ai/context";
import { loadKey } from "@/server/crypto";
import { pool } from "@/server/db/client";
import { aiTick } from "../../src/worker/ai/batcher";
import type { AiClient } from "../../src/worker/ai/nim-client";
import { Ingest } from "../../src/worker/whatsapp/ingest";
import { client, resetData, seedStudent } from "./api";

const GROUP = "120363000000000001@g.us";
const key = loadKey(); // the same key the API uses to show source messages
let a: ReturnType<typeof client>;
let b: ReturnType<typeof client>;
let courseId: string;
let ingest: Ingest;
let seq = 0;

const later = () => new Date(Date.now() + 3 * 60_000);
const ai = (reply: (ctx: AiContext) => object[]): AiClient => ({
  model: "fake/model",
  complete: async (chat) => {
    const ctx = JSON.parse(chat[1]!.content) as AiContext;
    return { content: JSON.stringify({ messages: ctx.messages.map((m) => ({ id: m.id, decision: "applied", reason: "t" })), operations: reply(ctx), unknownCourses: [] }), inputTokens: 1, outputTokens: 1 };
  },
});
/** An announcement processed by the AI into one operation. */
async function announce(text: string, op: (ctx: AiContext) => object) {
  await ingest.handle("messages.upsert", {
    type: "notify",
    messages: [{ key: { remoteJid: GROUP, id: `M${++seq}`, fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000) + 5, pushName: "Kasun", message: { conversation: text } }],
  });
  await aiTick(ai((ctx) => [{ ...op(ctx), sourceMessageIds: [ctx.messages[0]!.id] }]), key, later());
}
const feed = async () => (await a(activity.GET, "GET", "/activity")).json.items;

beforeEach(async () => {
  await resetData();
  const me = await seedStudent("a@example.com");
  a = client(me.cookie);
  b = client((await seedStudent("b@example.com")).cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-08-03", endDate: "2026-12-18" } })).json.id;
  courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  await pool.query("insert into wa_group (student_id, wa_jid, subject, linked_course_id) values ($1, $2, 'CS2010 group', $3)", [me.id, GROUP, courseId]);
  ingest = new Ingest(me.id, key);
  await ingest.reloadGroups();
});

describe("the Activity Log", () => {
  it("lists each Auto Change with its source message, sender and time, and Undo allowed", async () => {
    await announce("DS Lab 4 due 27th", () => ({ op: "create_assignment", courseId, title: "Lab 4 report", dueDate: "2026-11-27" }));
    expect(await feed()).toMatchObject([
      { type: "auto_change", summary: "Lab 4 report: due Fri 27 Nov", risk: "normal", canUndo: true, undoBlockedReason: null, sources: [{ senderName: "Kasun", groupSubject: "CS2010 group", text: "DS Lab 4 due 27th", sentAt: expect.stringMatching(/Z$/) }] },
    ]);
  });
});

describe("Undo", () => {
  it("undoes a correction, restoring the earlier value", async () => {
    const item = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4", dueDate: "2026-11-27" } })).json;
    await announce("sorry, Lab 4 is due 30th", () => ({ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-11-30" } }));
    const [change] = await feed();
    expect(change).toMatchObject({ risk: "moved_later" });
    const res = await a(undo.POST, "POST", `/auto-changes/${change.id}/undo`, { params: { id: change.id } });
    expect(res.status).toBe(200);
    expect((await a(assignments.GET, "GET", "/assignments")).json).toMatchObject([{ dueDate: "2026-11-27", version: 3 }]);
    expect((await feed())[0]).toMatchObject({ undoneAt: expect.any(String), canUndo: false, undoBlockedReason: "Already undone" });
  });

  it("is blocked, with the reason, once the Student edited the item", async () => {
    await announce("Lab 5 due 4th", () => ({ op: "create_assignment", courseId, title: "Lab 5", dueDate: "2026-12-04" }));
    const [item] = (await a(assignments.GET, "GET", "/assignments")).json;
    await a(assignment.PATCH, "PATCH", `/assignments/${item.id}`, { params: { id: item.id }, body: { expectedVersion: 1, title: "Lab 5 (mine)" } });
    const [change] = await feed();
    expect(change).toMatchObject({ canUndo: false, undoBlockedReason: "You edited this after the change" });
    const res = await a(undo.POST, "POST", `/auto-changes/${change.id}/undo`, { params: { id: change.id } });
    expect(res).toMatchObject({ status: 409, json: { error: { code: "UNDO_BLOCKED", message: "You edited this after the change" } } });
  });

  it("removes an AI-created item and stops the same announcement recreating it", async () => {
    await announce("Lab 6 due 5th", () => ({ op: "create_assignment", courseId, title: "Lab 6", dueDate: "2026-12-05" }));
    const [change] = await feed();
    await a(undo.POST, "POST", `/auto-changes/${change.id}/undo`, { params: { id: change.id } });
    expect((await a(assignments.GET, "GET", "/assignments")).json).toEqual([]);
    await announce("reminder: lab 6 due 5th", () => ({ op: "create_assignment", courseId, title: "lab 6", dueDate: "2026-12-05" }));
    expect((await a(assignments.GET, "GET", "/assignments")).json).toEqual([]);
    expect((await pool.query("select decision, possibly_missed from inbox_message order by received_at desc limit 1")).rows).toEqual([{ decision: "superseded", possibly_missed: false }]);
  });

  it("restores a cancelled item", async () => {
    const item = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Essay", dueDate: "2026-12-01" } })).json;
    await announce("essay cancelled", () => ({ op: "cancel_assignment", assignmentId: item.id }));
    expect((await a(assignments.GET, "GET", "/assignments")).json).toEqual([]);
    const [change] = await feed();
    await a(undo.POST, "POST", `/auto-changes/${change.id}/undo`, { params: { id: change.id } });
    expect((await a(assignments.GET, "GET", "/assignments")).json).toMatchObject([{ title: "Essay" }]);
  });

  it("is 404 for another Student, who sees none of the changes", async () => {
    await announce("Lab 7 due 6th", () => ({ op: "create_assignment", courseId, title: "Lab 7", dueDate: "2026-12-06" }));
    const [change] = await feed();
    expect((await b(undo.POST, "POST", `/auto-changes/${change.id}/undo`, { params: { id: change.id } })).status).toBe(404);
    expect((await b(activity.GET, "GET", "/activity")).json.items).toEqual([]);
  });
});

describe("the dashboard", () => {
  it("highlights risky changes until undone, and lists the last 48 hours", async () => {
    const item = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Quiz prep", dueDate: "2026-12-01" } })).json;
    await announce("quiz prep moved to the 3rd", () => ({ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-12-03" } }));
    const d = (await a(dashboard.GET, "GET", "/dashboard")).json;
    expect(d.highlightedChanges).toMatchObject([{ risk: "moved_later", summary: "Quiz prep: Tue 1 Dec → Thu 3 Dec" }]);
    expect(d.recentAutoChanges).toHaveLength(1);
    await a(undo.POST, "POST", `/auto-changes/${d.highlightedChanges[0].id}/undo`, { params: { id: d.highlightedChanges[0].id } });
    expect((await a(dashboard.GET, "GET", "/dashboard")).json.highlightedChanges).toEqual([]);
  });
});
