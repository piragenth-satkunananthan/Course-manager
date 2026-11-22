// Seam: the worker's AI processor against a real Postgres, with a fake AI client returning canned ops.v1 output (#12).
import { beforeEach, describe, expect, it } from "vitest";
import * as assignmentStatus from "@/app/api/v1/assignments/[id]/status/route";
import * as assignments from "@/app/api/v1/assignments/route";
import * as courses from "@/app/api/v1/courses/route";
import * as undo from "@/app/api/v1/auto-changes/[id]/undo/route";
import * as classSessions from "@/app/api/v1/courses/[id]/class-sessions/route";
import * as semesters from "@/app/api/v1/semesters/route";
import * as timetable from "@/app/api/v1/timetable/route";
import type { AiContext } from "@/server/ai/context";
import { loadKey } from "@/server/crypto";
import { pool } from "@/server/db/client";
import { addDays, todayIn, weekdayOf } from "@/server/domain/time";
import { aiTick, claimBatch, resetStale } from "../../src/worker/ai/batcher";
import { type AiClient, AiFatalError, AiRetryableError } from "../../src/worker/ai/nim-client";
import { Ingest } from "../../src/worker/whatsapp/ingest";
import { client, resetData, seedStudent } from "./api";

const GROUP = "120363000000000001@g.us";
const key = loadKey(); // the API's key too: Undo's response shows the source messages
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

describe("Possibly Missed and Unknown Courses (#14)", () => {
  const decide = (decision: string) => fakeAi((ctx) => ({ messages: decideAll(ctx, decision), operations: [], unknownCourses: [] }));

  it("flags an ignored message or a question with a date, time or deadline word, and one the AI calls possibly missed", async () => {
    await say("thanks all");
    await aiTick(decide("ignored"), key, later());
    await say("is the quiz open-book?");
    await aiTick(decide("question"), key, later());
    await say("Group B lab cancelled");
    await aiTick(decide("possibly_missed"), key, later());
    await say("see you at 3pm");
    await aiTick(decide("ignored"), key, later());
    expect((await inbox()).map((r) => [r.decision, r.possibly_missed])).toEqual([
      ["ignored", false],
      ["question", true],
      ["possibly_missed", true],
      ["ignored", true],
    ]);
  });

  const mentions = async () => (await pool.query("select name, name_key, status, jsonb_array_length(pending_ops) as ops, first_message_id is not null as first from unknown_course_mention")).rows;
  const unknown = (name: string) =>
    fakeAi((ctx) => ({
      messages: decideAll(ctx, "unknown_course"),
      operations: [],
      unknownCourses: [{ name, messageIds: ctx.messages.map((m) => m.id), proposedOperations: [{ ...create(ctx), courseId: null, title: "Essay" }] }],
    }));

  it("logs one Unknown Course per name, a repeat adds its operations, and an ignored name stays quiet", async () => {
    await say("ENG essay due 27th");
    await aiTick(unknown("ENG"), key, later());
    await say("eng essay reminder: due 27th");
    await aiTick(unknown(" eng "), key, later());
    expect(await mentions()).toEqual([{ name: "ENG", name_key: "eng", status: "open", ops: 2, first: true }]);
    expect(await inbox()).toMatchObject([
      { decision: "unknown_course", possibly_missed: false },
      { decision: "unknown_course", possibly_missed: false },
    ]);

    await pool.query("update unknown_course_mention set status = 'ignored'");
    await say("ENG essay due 28th");
    await aiTick(unknown("ENG"), key, later());
    expect(await mentions()).toMatchObject([{ status: "ignored", ops: 2 }]);
  });
});

describe("pause, outages and limits (#15)", () => {
  const alerts = async () => (await pool.query("select payload->>'cause' as cause from activity_event where kind = 'alert' order by created_at")).rows.map((r) => r.cause);
  const down: AiClient = { model: "fake", complete: async () => Promise.reject(new AiRetryableError("NIM 503")) };

  it("while paused, messages queue and the AI isn't called; resuming processes them", async () => {
    await pool.query("update \"user\" set auto_changes_paused = true");
    await say("Lab due Friday");
    const ai = fakeAi((ctx) => ops(ctx, [create(ctx)]));
    await aiTick(ai, key, later(10));
    expect(ai.calls).toBe(0);
    expect(await inbox()).toMatchObject([{ status: "pending", attempts: 0 }]);
    await pool.query("update \"user\" set auto_changes_paused = false");
    await aiTick(ai, key, later(11));
    expect(await inbox()).toMatchObject([{ status: "done", decision: "applied" }]);
  });

  it("backs off 1, 5, 15 and 60 minutes, then hourly; never marks a message dead; alerts once after an hour of failures", async () => {
    await say("Lab due Friday");
    let t = later();
    const waits: number[] = [];
    const seen: string[][] = [];
    for (let i = 0; i < 6; i++) {
      await aiTick(down, key, t);
      const [m] = (await pool.query("select next_attempt_at from inbox_message")).rows;
      waits.push(Math.round((+m.next_attempt_at - +t) / 60_000));
      seen.push(await alerts());
      t = new Date(+m.next_attempt_at + 1000);
    }
    expect(waits).toEqual([1, 5, 15, 60, 60, 60]);
    expect(await inbox()).toMatchObject([{ status: "pending", attempts: 6 }]);
    // Failures began about 3 minutes after the message: no alert until they've gone on for an hour, then only one.
    expect(seen.map((a) => a.length)).toEqual([0, 0, 0, 0, 1, 1]);
    expect(seen[5]).toEqual(["ai_outage"]);

    const ai = fakeAi((ctx) => ops(ctx, []));
    await aiTick(ai, key, t);
    expect(await inbox()).toMatchObject([{ status: "done", decision: "applied" }]);
  });

  it("counts the hour from the first failure: messages that waited through a long pause don't alert on one failure", async () => {
    await pool.query("update \"user\" set auto_changes_paused = true");
    await say("Lab due Friday");
    await aiTick(fakeAi((ctx) => ops(ctx, [])), key, later(90)); // paused: nothing runs
    await pool.query("update \"user\" set auto_changes_paused = false");
    await aiTick(down, key, later(95));
    expect(await alerts()).toEqual([]);
  });

  it("alerts when a batch asks for more than 10 changes", async () => {
    await say("a long list");
    await aiTick(fakeAi((ctx) => ops(ctx, Array.from({ length: 11 }, (_, i) => create(ctx, { title: `Lab ${10 + i}` })))), key, later());
    expect(await alerts()).toEqual(["ai_overflow"]);
  });

  it("a fatal error (key refused, model gone) leaves the messages untouched and stops the tick", async () => {
    await say("Lab due Friday");
    const refused: AiClient = { model: "fake", complete: async () => Promise.reject(new AiFatalError("NIM refused the key (401)")) };
    await expect(aiTick(refused, key, later())).rejects.toBeInstanceOf(AiFatalError);
    expect(await inbox()).toMatchObject([{ status: "pending", attempts: 0, possibly_missed: false }]);
  });
});

describe("the timetable and the Semester (#16)", () => {
  const today = todayIn(new Date());
  const day = addDays(today, 2); // a class two days from now
  const monday = (d: string) => addDays(d, 1 - weekdayOf(d));
  let sessionId: string;
  beforeEach(async () => {
    sessionId = (await a(classSessions.POST, "POST", `/courses/${courseId}/class-sessions`, { params: { id: courseId }, body: { kind: "lecture", weekday: weekdayOf(day), startTime: "08:00", endTime: "10:00", location: "Hall A" } })).json.id;
  });
  const week = async (d = day) => (await a(timetable.GET, "GET", "/timetable", { query: { week: monday(d) } })).json as { date: string; status: string; startTime: string; location: string | null; classSessionId: string | null }[];
  const on = async (d = day) => (await week(d)).filter((o) => o.date === d || (o.classSessionId === sessionId && o.status === "rescheduled"));
  const active = async () => (await pool.query("select kind from session_change where deleted_at is null")).rows.map((r) => r.kind);
  const run = (make: (ctx: AiContext) => object[]) => aiTick(fakeAi((ctx) => ops(ctx, make(ctx).map((o) => ({ ...o, sourceMessageIds: [ctx.messages[0]!.id] })))), key, later());
  const lastChange = async () => (await pool.query("select id, summary, risk, entity_type from auto_change order by created_at desc limit 1")).rows[0];
  // Each message a second after the last: "most recently sent wins" needs them in order.
  let clock = Date.now();
  const tell = (text: string) => say(text, new Date((clock += 1000)));

  it("the AI sees the coming classes; a cancellation is applied, risky, and can be undone", async () => {
    await tell("Tuesday's DS lecture is cancelled");
    let seen: AiContext | undefined;
    await aiTick(fakeAi((ctx) => ((seen = ctx), ops(ctx, [{ op: "cancel_occurrence", classSessionId: sessionId, date: day, sourceMessageIds: [ctx.messages[0]!.id] }]))), key, later());
    expect(seen?.occurrences).toContainEqual({ classSessionId: sessionId, courseId, kind: "lecture", date: day, start: "08:00", end: "10:00", location: "Hall A", status: "normal", originalDate: null, sessionChangeId: null });
    expect(await on()).toMatchObject([{ status: "cancelled" }]);
    const change = await lastChange();
    expect(change).toMatchObject({ risk: "cancelled", entity_type: "session_change", summary: expect.stringMatching(/^CS2010 lecture .+ cancelled$/) });
    expect((await a(undo.POST, "POST", `/auto-changes/${change.id}/undo`, { params: { id: change.id } })).status).toBe(200);
    expect(await on()).toMatchObject([{ status: "normal" }]);
  });

  it("a reschedule, then its correction, updates the same change; \"back on\" removes it", async () => {
    await tell("Tuesday's lecture moved to 3pm");
    await run(() => [{ op: "reschedule_occurrence", classSessionId: sessionId, date: day, newDate: day, newStart: "15:00", newEnd: "17:00" }]);
    expect(await on()).toMatchObject([{ status: "rescheduled", startTime: "15:00", location: "Hall A" }]);
    // The AI may name the occurrence again instead of the change: still one change, never two.
    await tell("sorry, 4pm not 3pm");
    await run(() => [{ op: "reschedule_occurrence", classSessionId: sessionId, date: day, newDate: day, newStart: "16:00", newEnd: "18:00" }]);
    expect(await active()).toEqual(["reschedule"]);
    expect(await on()).toMatchObject([{ status: "rescheduled", startTime: "16:00" }]);
    expect((await lastChange()).risk).toBe("normal");

    await tell("come to mac lab instead");
    await run((ctx) => [{ op: "update_session_change", sessionChangeId: ctx.occurrences.find((o) => o.status === "rescheduled")!.sessionChangeId, fields: { newLocation: "Mac Lab" } }]);
    expect(await on()).toMatchObject([{ startTime: "16:00", location: "Mac Lab" }]);

    await tell("the lecture is back on at the usual time");
    await run((ctx) => [{ op: "remove_session_change", sessionChangeId: ctx.occurrences.find((o) => o.status === "rescheduled")!.sessionChangeId }]);
    expect(await active()).toEqual([]);
    expect(await on()).toMatchObject([{ status: "normal", startTime: "08:00" }]);
  });

  it("cancelling an occurrence that was rescheduled turns that change into a cancellation", async () => {
    await tell("moved to 3pm");
    await run(() => [{ op: "reschedule_occurrence", classSessionId: sessionId, date: day, newDate: day, newStart: "15:00", newEnd: "17:00" }]);
    await tell("actually it's cancelled");
    await run(() => [{ op: "cancel_occurrence", classSessionId: sessionId, date: day }]);
    expect(await active()).toEqual(["cancel"]);
    expect(await on()).toMatchObject([{ status: "cancelled" }]);
    expect((await lastChange()).risk).toBe("cancelled");
  });

  it("adds an extra session; removing it is a risky cancellation", async () => {
    const sat = addDays(day, 3);
    await tell("extra lab on Saturday 9am");
    await run(() => [{ op: "add_extra_session", courseId, kind: "lab", date: sat, start: "09:00", end: "11:00", location: "Mac Lab" }]);
    expect((await week(sat)).filter((o) => o.status === "extra")).toMatchObject([{ date: sat, startTime: "09:00", location: "Mac Lab" }]);
    expect((await lastChange()).summary).toMatch(/^Extra CS2010 lab .+, 09:00–11:00, Mac Lab$/);
    await tell("no extra lab after all");
    await run((ctx) => [{ op: "remove_session_change", sessionChangeId: ctx.occurrences.find((o) => o.status === "extra")!.sessionChangeId }]);
    expect((await week(sat)).filter((o) => o.status === "extra")).toEqual([]);
    expect((await lastChange()).risk).toBe("cancelled");
  });

  it("extends the Semester: weekly classes continue, a due date in the new weeks applies in the same batch, and Undo restores the end", async () => {
    const newEnd = "2027-01-15";
    await tell("semester extended by 4 weeks; final report due 2027-01-08");
    await run((ctx) => [{ op: "extend_semester", semesterId: ctx.semester!.id, newEndDate: newEnd }, create(ctx, { title: "Final report", dueDate: "2027-01-08" })]);
    expect((await a(semesters.GET, "GET", "/semesters")).json).toMatchObject([{ endDate: newEnd }]);
    expect((await a(assignments.GET, "GET", "/assignments")).json).toMatchObject([{ title: "Final report", dueDate: "2027-01-08" }]);
    expect((await week("2027-01-11")).filter((o) => o.classSessionId === sessionId)).toHaveLength(1);
    const ext = (await pool.query("select id, summary from auto_change where entity_type = 'semester'")).rows[0];
    expect(ext.summary).toMatch(/^Semester ends .+ → .+$/);
    expect((await a(undo.POST, "POST", `/auto-changes/${ext.id}/undo`, { params: { id: ext.id } })).status).toBe(200);
    expect((await a(semesters.GET, "GET", "/semesters")).json).toMatchObject([{ endDate: "2026-12-18" }]);
  });
});
