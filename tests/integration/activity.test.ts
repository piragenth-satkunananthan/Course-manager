// Seam: the Activity Log, Undo and the dashboard's Auto Change sections against a real Postgres (#12).
import { beforeEach, describe, expect, it } from "vitest";
import * as activity from "@/app/api/v1/activity/route";
import * as assignment from "@/app/api/v1/assignments/[id]/route";
import * as assignments from "@/app/api/v1/assignments/route";
import * as batchUndo from "@/app/api/v1/ai-batches/[id]/undo/route";
import * as undo from "@/app/api/v1/auto-changes/[id]/undo/route";
import * as courses from "@/app/api/v1/courses/route";
import * as dashboard from "@/app/api/v1/dashboard/route";
import * as dismiss from "@/app/api/v1/possibly-missed/[id]/dismiss/route";
import * as resolve from "@/app/api/v1/unknown-courses/[id]/resolve/route";
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
let semesterId: string;
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
  semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-08-03", endDate: "2026-12-18" } })).json.id;
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

/** One message, and the AI's whole reply to it. */
async function process(text: string, reply: (id: string) => object) {
  await ingest.handle("messages.upsert", {
    type: "notify",
    messages: [{ key: { remoteJid: GROUP, id: `M${++seq}`, fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000) + 5, pushName: "Kasun", message: { conversation: text } }],
  });
  const fake: AiClient = { model: "fake/model", complete: async (chat) => ({ content: JSON.stringify(reply((JSON.parse(chat[1]!.content) as AiContext).messages[0]!.id)), inputTokens: 1, outputTokens: 1 }) };
  await aiTick(fake, key, later());
}

describe("Possibly Missed (#14)", () => {
  it("lists the message with its group, reason and Course; Dismiss removes it, only for its Student", async () => {
    await process("practical report due 27th", (id) => ({ messages: [{ id, decision: "possibly_missed", reason: "CS2010 has no Practical Course" }], operations: [], unknownCourses: [] }));
    const [item] = await feed();
    expect(item).toMatchObject({ type: "possibly_missed", senderName: "Kasun", groupSubject: "CS2010 group", text: "practical report due 27th", reason: "CS2010 has no Practical Course", courseId });
    const path = `/possibly-missed/${item.inboxMessageId}/dismiss`;
    expect((await b(dismiss.POST, "POST", path, { params: { id: item.inboxMessageId } })).status).toBe(404);
    expect((await a(dismiss.POST, "POST", path, { params: { id: item.inboxMessageId } })).status).toBe(204);
    expect(await feed()).toEqual([]);
  });
});

describe("Unknown Courses (#14)", () => {
  const essay = (id: string, o: object = {}) => ({ op: "create_assignment", courseId: null, title: "Essay", dueDate: "2026-11-27", sourceMessageIds: [id], ...o });
  const mention = (name: string, proposed: (id: string) => object[]) => (id: string) => ({
    messages: [{ id, decision: "unknown_course", reason: "not a known course" }],
    operations: [],
    unknownCourses: [{ name, messageIds: [id], proposedOperations: proposed(id) }],
  });
  const openEntry = async () => (await feed()).find((i: { type: string }) => i.type === "unknown_course");
  const post = (client: typeof a, id: string, body: object) => client(resolve.POST, "POST", `/unknown-courses/${id}/resolve`, { params: { id }, body });

  it("is listed with its first message; Add course creates it in the current Semester, with the name as a Nickname, and applies the operations as undoable Auto Changes", async () => {
    await process("ENG essay due 27th", mention("ENG", (id) => [essay(id)]));
    const entry = await openEntry();
    expect(entry).toMatchObject({ name: "ENG", status: "open", operations: 1, firstMessage: { senderName: "Kasun", text: "ENG essay due 27th", groupSubject: "CS2010 group" } });

    expect((await post(b, entry.id, { action: "ignore" })).status).toBe(404);
    const res = await post(a, entry.id, { action: "add", code: "EN1010", name: "English", colour: "pink" });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ applied: 1, possiblyMissed: 0, course: { code: "EN1010", semesterId, nicknames: [{ nickname: "eng" }] } });
    expect((await a(assignments.GET, "GET", "/assignments")).json).toMatchObject([{ title: "Essay", courseCode: "EN1010", source: "ai" }]);
    expect(await feed()).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "auto_change", summary: "Essay: due Fri 27 Nov", canUndo: true }), expect.objectContaining({ type: "unknown_course", status: "added" })]),
    );
    expect((await post(a, entry.id, { action: "ignore" })).status).toBe(409);
  });

  it("Nickname of… maps it to a Course, applies a repeat once, and flags an operation that no longer passes validation", async () => {
    await process("ds2 essay due 27th", mention("DS2", (id) => [essay(id), essay(id, { title: "Report", dueDate: "2027-03-01" })]));
    await process("ds2 essay reminder", mention("DS2", (id) => [essay(id)]));
    const entry = await openEntry();
    expect(entry).toMatchObject({ operations: 3 });
    const res = await post(a, entry.id, { action: "nickname", courseId });
    expect(res.json).toMatchObject({ applied: 1, possiblyMissed: 1 });
    expect((await a(assignments.GET, "GET", "/assignments")).json).toMatchObject([{ title: "Essay", courseCode: "CS2010" }]);
    expect((await pool.query("select nickname, source from course_nickname")).rows).toEqual([{ nickname: "ds2", source: "unknown_course" }]);
    expect((await feed()).filter((i: { type: string }) => i.type === "possibly_missed")).toMatchObject([{ text: "ds2 essay due 27th" }]);
  });

  it("Ignore applies nothing and stops the name being logged", async () => {
    await process("ENG essay due 27th", mention("ENG", (id) => [essay(id)]));
    const entry = await openEntry();
    expect((await post(a, entry.id, { action: "ignore" })).json).toMatchObject({ applied: 0, possiblyMissed: 0 });
    await process("ENG essay due 28th", mention("ENG", (id) => [essay(id)]));
    expect((await feed()).filter((i: { type: string }) => i.type === "unknown_course")).toMatchObject([{ status: "ignored", operations: 1 }]);
    expect((await a(assignments.GET, "GET", "/assignments")).json).toEqual([]);
  });
});

describe("Undo batch (#22)", () => {
  /** One message whose batch makes several changes. */
  async function batch(text: string, ops: (ctx: AiContext) => object[]) {
    await ingest.handle("messages.upsert", {
      type: "notify",
      messages: [{ key: { remoteJid: GROUP, id: `M${++seq}`, fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000) + 5, pushName: "Kasun", message: { conversation: text } }],
    });
    await aiTick(ai((ctx) => ops(ctx).map((o) => ({ ...o, sourceMessageIds: [ctx.messages[0]!.id] }))), key, later());
  }
  const undoAll = (batchId: string, who = a) => who(batchUndo.POST, "POST", `/ai-batches/${batchId}/undo`, { params: { id: batchId } });

  it("undoes each change newest first, skipping the one the Student edited since, and says why", async () => {
    const lab = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4", dueDate: "2026-11-27" } })).json;
    await batch("Lab 4 is now Lab 4 report, due 30th; Lab 5 due Dec 4", () => [
      { op: "update_assignment", assignmentId: lab.id, fields: { dueDate: "2026-11-30" } },
      { op: "update_assignment", assignmentId: lab.id, fields: { title: "Lab 4 report" } },
      { op: "create_assignment", courseId, title: "Lab 5", dueDate: "2026-12-04" },
    ]);
    const changes = (await feed()).filter((i: { type: string }) => i.type === "auto_change");
    expect(changes).toHaveLength(3);
    expect(changes.every((c: { batchId: string; batchOpen: number }) => c.batchId === changes[0].batchId && c.batchOpen === 3)).toBe(true);
    // The Student edits Lab 5 afterwards: that change can't be undone any more.
    const lab5 = (await a(assignments.GET, "GET", "/assignments")).json.find((x: { title: string }) => x.title === "Lab 5");
    await a(assignment.PATCH, "PATCH", `/assignments/${lab5.id}`, { params: { id: lab5.id }, body: { expectedVersion: lab5.version, title: "Lab 5 (mine)" } });

    expect((await undoAll(changes[0].batchId, b)).status).toBe(404);
    const res = await undoAll(changes[0].batchId);
    expect(res.status).toBe(200);
    expect(res.json.undone.map((u: { summary: string }) => u.summary).sort()).toEqual(["Lab 4 report updated", "Lab 4: Fri 27 Nov → Mon 30 Nov"]);
    expect(res.json.skipped).toEqual([{ autoChangeId: expect.any(String), summary: "Lab 5: due Fri 4 Dec", reason: "You edited this after the change" }]);
    // Both of Lab 4's changes are undone, even though they touched the same item.
    expect((await a(assignments.GET, "GET", "/assignments")).json).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: "Lab 4", dueDate: "2026-11-27" }), expect.objectContaining({ title: "Lab 5 (mine)" })]),
    );
    const after = (await feed()).filter((i: { type: string }) => i.type === "auto_change");
    expect(after.map((c: { undoneAt: string | null }) => !!c.undoneAt).sort()).toEqual([false, true, true]);
    expect(after.every((c: { batchOpen: number }) => c.batchOpen === 1)).toBe(true);
  });

  it("filters the feed: changes only, or what needs attention", async () => {
    await announce("Lab 6 due Dec 4", () => ({ op: "create_assignment", courseId, title: "Lab 6", dueDate: "2026-12-04" }));
    const studentId = (await pool.query("select id from \"user\" where email = 'a@example.com'")).rows[0].id;
    await pool.query("insert into activity_event (student_id, kind, payload) values ($1, 'stuck_messages', '{\"count\": 3}'), ($1, 'file_too_large', '{\"fileName\": \"notes.pdf\"}')", [studentId]);
    const kinds = async (filter?: string) => ((await a(activity.GET, "GET", "/activity", { query: filter ? { filter } : {} })).json.items as { type: string }[]).map((i) => i.type).sort();
    expect(await kinds()).toEqual(["auto_change", "event", "event"]);
    expect(await kinds("changes")).toEqual(["auto_change"]);
    expect(await kinds("attention")).toEqual(["event", "event"]);
    expect((await a(activity.GET, "GET", "/activity", { query: { filter: "nope" } })).status).toBe(400);
  });
});
