// Seam: the worker's AI processor against a real Postgres, with a fake AI client returning canned ops.v1 output (#12).
import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import * as assignmentStatus from "@/app/api/v1/assignments/[id]/status/route";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as semesters from "@/app/api/v1/semesters/route";
import type { AiContext } from "@/server/ai/context";
import { loadKey } from "@/server/crypto";
import { pool } from "@/server/db/client";
import { aiTick, claimBatch, resetStale } from "../../src/worker/ai/batcher";
import { type AiClient, AiRetryableError } from "../../src/worker/ai/nim-client";
import { Ingest } from "../../src/worker/whatsapp/ingest";
import { client, resetData, seedStudent } from "./api";

const GROUP = "120363000000000001@g.us";
const key = loadKey(randomBytes(32).toString("base64"));
let a: ReturnType<typeof client>;
let studentId: string;
let courseId: string;
let groupId: string;
let ingest: Ingest;
let seq = 0;

// Runs after messages have been quiet for 3 minutes.
const later = (min = 3) => new Date(Date.now() + min * 60_000);
const say = async (text: string, sentAt = new Date()) =>
  ingest.handle("messages.upsert", {
    type: "notify",
    messages: [{ key: { remoteJid: GROUP, id: `M${++seq}`, fromMe: false, participant: "9477@s.whatsapp.net" }, messageTimestamp: Math.floor(+sentAt / 1000), pushName: "Kasun", message: { conversation: text } }],
  });

/** A fake AI: `reply` sees the real context it was given and returns ops.v1. */
const fakeAi = (reply: (ctx: AiContext) => object | string): AiClient & { calls: number } => {
  const ai = {
    model: "fake/model",
    calls: 0,
    async complete(chat: { content: string }[]) {
      ai.calls++;
      const r = reply(JSON.parse(chat[1]!.content) as AiContext);
      return { content: typeof r === "string" ? r : JSON.stringify(r), inputTokens: 100, outputTokens: 20 };
    },
  };
  return ai;
};
const decideAll = (ctx: AiContext, decision = "applied") => ctx.messages.map((m) => ({ id: m.id, decision, reason: "test" }));
const create = (ctx: AiContext, o: object = {}) => ({ op: "create_assignment", courseId, title: "Lab 4 report", dueDate: "2026-11-27", sourceMessageIds: ctx.messages.map((m) => m.id), ...o });
const ops = (ctx: AiContext, operations: object[]) => ({ messages: decideAll(ctx), operations, unknownCourses: [] });

beforeEach(async () => {
  await resetData();
  const me = await seedStudent("a@example.com");
  studentId = me.id;
  a = client(me.cookie);
  const semesterId = (await a(semesters.POST, "POST", "/semesters", { body: { name: "S", startDate: "2026-08-03", endDate: "2026-12-18" } })).json.id;
  courseId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2010", name: "DS", colour: "blue" } })).json.id;
  groupId = (await pool.query("insert into wa_group (student_id, wa_jid, subject, linked_course_id) values ($1, $2, 'CS2010 group', $3) returning id", [studentId, GROUP, courseId])).rows[0].id;
  ingest = new Ingest(studentId, key);
  await ingest.reloadGroups();
});

const changes = async () => (await pool.query("select op, summary, risk, after_version, (select count(*)::int from auto_change_source s where s.auto_change_id = c.id) as sources from auto_change c order by created_at")).rows;
const inbox = async () => (await pool.query("select status, decision, possibly_missed, attempts from inbox_message order by sent_at")).rows;

describe("an announcement becomes an Auto Change", () => {
  it("creates the Assignment, logs the change with its source, and marks the message done in one go", async () => {
    await say("DS lab report due 27th");
    let seen: AiContext | undefined;
    await aiTick(fakeAi((ctx) => ((seen = ctx), ops(ctx, [create(ctx)]))), key, later());
    expect(seen).toMatchObject({ timeZone: "Asia/Colombo", linkedTo: { courseId }, courses: [{ code: "CS2010" }], messages: [{ sender: "Kasun", kind: "text", text: "DS lab report due 27th" }] });
    expect((await a(assignments.GET, "GET", "/assignments")).json).toMatchObject([{ title: "Lab 4 report", dueDate: "2026-11-27", source: "ai" }]);
    expect(await changes()).toEqual([{ op: "create", summary: "Lab 4 report: due Fri 27 Nov", risk: "normal", after_version: 1, sources: 1 }]);
    expect(await inbox()).toEqual([{ status: "done", decision: "applied", possibly_missed: false, attempts: 0 }]);
  });

  it("tells the AI about the linked Course's Practical Course (#26)", async () => {
    const semesterId = (await pool.query("select semester_id from course where id = $1", [courseId])).rows[0].semester_id;
    const practicalId = (await a(courses.POST, "POST", "/courses", { body: { semesterId, code: "CS2011", name: "DS Practical", colour: "blue", practicalOfCourseId: courseId } })).json.id;
    await say("practical report due Friday");
    let seen: AiContext | undefined;
    await aiTick(fakeAi((ctx) => ((seen = ctx), ops(ctx, []))), key, later());
    expect(seen?.linkedTo).toEqual({ courseId, practicalCourseId: practicalId });
    expect(seen?.courses).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: practicalId, practicalOf: courseId }), expect.not.objectContaining({ practicalOf: expect.anything() })]),
    );
  });

  it("waits until the group has been quiet for 2 minutes, or its oldest message is 5 minutes old", async () => {
    await say("first");
    const ai = fakeAi((ctx) => ops(ctx, []));
    await aiTick(ai, key, later(1));
    expect(ai.calls).toBe(0);
    await pool.query("update inbox_message set received_at = now() - interval '6 minutes'");
    await say("still talking");
    await aiTick(ai, key, later(0));
    expect(ai.calls).toBe(1);
  });
});

describe("corrections, repeats and precedence", () => {
  it("updates the existing item for a correction, and a late older message can't overwrite it", async () => {
    await say("Lab 4 due 27th", new Date(Date.now() - 3600_000));
    await aiTick(fakeAi((ctx) => ops(ctx, [create(ctx)])), key, later());
    const [item] = (await a(assignments.GET, "GET", "/assignments")).json;

    await say("sorry, Lab 4 is due 26th", new Date(Date.now() - 1800_000));
    await aiTick(fakeAi((ctx) => ops(ctx, [{ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-11-26" }, sourceMessageIds: [ctx.messages[0]!.id] }])), key, later());
    // An older message (sent before the correction) arrives late, asking for the 28th: it loses.
    await say("Lab 4 due 28th", new Date(Date.now() - 2700_000));
    await aiTick(fakeAi((ctx) => ops(ctx, [{ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-11-28" }, sourceMessageIds: [ctx.messages[0]!.id] }])), key, later());

    expect((await a(assignments.GET, "GET", "/assignments")).json).toMatchObject([{ dueDate: "2026-11-26", version: 2 }]);
    expect((await changes()).map((c) => c.summary)).toEqual(["Lab 4 report: due Fri 27 Nov", "Lab 4 report: Fri 27 Nov → Thu 26 Nov"]);
  });

  it("doesn't duplicate a repeated announcement, even of a submitted Assignment, and doesn't flag it", async () => {
    const item = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 4 report", dueDate: "2026-11-27" } })).json;
    await a(assignmentStatus.PUT, "PUT", `/assignments/${item.id}/status`, { params: { id: item.id }, body: { status: "submitted" } });
    await say("reminder: Lab 4 report due 27th");
    let seen: AiContext | undefined;
    await aiTick(fakeAi((ctx) => ((seen = ctx), ops(ctx, [create(ctx)]))), key, later());
    expect(seen!.assignments).toMatchObject([{ id: item.id, status: "submitted" }]);
    expect((await a(assignments.GET, "GET", "/assignments")).json).toHaveLength(1);
    expect(await changes()).toEqual([]);
    expect(await inbox()).toMatchObject([{ status: "done", possibly_missed: false }]);
  });

  it("marks a cancellation risky", async () => {
    const item = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Quiz prep", dueDate: "2026-11-27" } })).json;
    await say("quiz prep is cancelled");
    await aiTick(fakeAi((ctx) => ops(ctx, [{ op: "cancel_assignment", assignmentId: item.id, sourceMessageIds: [ctx.messages[0]!.id] }])), key, later());
    expect(await changes()).toMatchObject([{ op: "delete", summary: "Quiz prep cancelled", risk: "cancelled" }]);
  });
});

describe("validation and volume", () => {
  it("retries once with the errors, then rejects: messages flagged, an Activity event written", async () => {
    await say("Lab due Friday");
    const ai = fakeAi(() => "not json");
    await aiTick(ai, key, later());
    expect(ai.calls).toBe(2);
    expect(await inbox()).toMatchObject([{ status: "done", decision: "rejected", possibly_missed: true }]);
    expect((await pool.query("select kind from activity_event")).rows).toEqual([{ kind: "ai_output_rejected" }]);
  });

  it("applies the first 10 operations of a big batch and flags the rest", async () => {
    await say("a long list");
    await aiTick(fakeAi((ctx) => ops(ctx, Array.from({ length: 12 }, (_, i) => create(ctx, { title: `Lab ${10 + i}` })))), key, later());
    expect(await changes()).toHaveLength(10);
    expect(await inbox()).toMatchObject([{ possibly_missed: true }]);
    expect((await pool.query("select kind from activity_event order by created_at")).rows.map((r) => r.kind)).toContain("ai_overflow");
  });
});

describe("failures and crashes", () => {
  it("flags the batch, rather than retrying forever, when applying fails", async () => {
    const item = (await a(assignments.POST, "POST", "/assignments", { body: { courseId, title: "Lab 9", dueDate: "2026-11-27" } })).json;
    await say("lab 9 moved to the 28th");
    await say("unrelated", new Date(Date.now() + 1000));
    const fake = fakeAi((ctx) => ops(ctx, [{ op: "update_assignment", assignmentId: item.id, fields: { dueDate: "2026-11-28" }, sourceMessageIds: [ctx.messages[0]!.id] }]));
    // The Student deletes it while the AI is working, so the write fails after validation.
    const ai: AiClient = { model: fake.model, complete: async (chat) => (await pool.query("update assignment set deleted_at = now() where id = $1", [item.id]), fake.complete(chat)) };
    await aiTick(ai, key, later());
    expect(await inbox()).toMatchObject([{ status: "done", decision: "rejected", possibly_missed: true }, { status: "done", decision: "rejected" }]);
    expect(await changes()).toEqual([]);
  });

  it("puts messages back to pending after an AI outage, with a backoff", async () => {
    await say("Lab due Friday");
    const down: AiClient = { model: "fake", complete: async () => Promise.reject(new AiRetryableError("NIM 503")) };
    const t = later();
    await aiTick(down, key, t);
    expect(await inbox()).toMatchObject([{ status: "pending", attempts: 1 }]);
    const ai = fakeAi((ctx) => ops(ctx, []));
    await aiTick(ai, key, new Date(+t + 30_000));
    expect(ai.calls).toBe(0); // next attempt is a minute later
    await aiTick(ai, key, new Date(+t + 61_000));
    expect(ai.calls).toBe(1);
  });

  it("reclaims a batch stuck in processing after 10 minutes, and two claims never share rows", async () => {
    await say("x");
    const t = later();
    const [first, second] = await Promise.all([claimBatch(studentId, groupId, t), claimBatch(studentId, groupId, t)]);
    expect([first, second].filter(Boolean)).toHaveLength(1);
    await resetStale(new Date(+t + 5 * 60_000));
    expect(await inbox()).toMatchObject([{ status: "processing" }]);
    await resetStale(new Date(+t + 11 * 60_000));
    expect(await inbox()).toMatchObject([{ status: "pending" }]);
  });
});
