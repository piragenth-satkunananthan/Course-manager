// The AI processor (design §8, file 64): picks batches per group, builds the context, calls the AI, validates, and
// applies everything in one transaction. Message text is decrypted only in memory and never logged.
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { applyOperations } from "@/server/ai/apply-operations";
import { type AiContext, buildContext, type ContextAdapter } from "@/server/ai/context";
import { validateOutput } from "@/server/ai/validate";
import { decrypt } from "@/server/crypto";
import { db } from "@/server/db/client";
import { activityEvent, aiBatch, assignment, course, courseNickname, exam, inboxMessage, semester, suppression, user, waGroup } from "@/server/db/schema";
import { addDays, todayIn } from "@/server/domain/time";
import { log } from "@/server/log";
import { raiseAlert } from "../scheduler/alerts";
import { type AiClient, AiFatalError, AiRetryableError } from "./nim-client";
import { PROMPT_VERSION, repairPrompt, SYSTEM_PROMPT, userPrompt } from "./prompt";

const QUIET_MS = 2 * 60_000;
const OLDEST_MS = 5 * 60_000;
const STALE_MS = 10 * 60_000;
const MAX_BATCH = 30;
const BACKOFF_MIN = [1, 5, 15, 60]; // then hourly
// Revoke rows wait for #13, which turns a delete into a system Undo.
const BATCHABLE = inArray(inboxMessage.kind, ["text", "edit"]);

/** Rows stuck in processing (a crash before commit) go back to pending; the rerun creates nothing twice. */
export async function resetStale(now: Date) {
  await db
    .update(inboxMessage)
    .set({ status: "pending", processingStartedAt: null })
    .where(and(eq(inboxMessage.status, "processing"), lte(inboxMessage.processingStartedAt, new Date(+now - STALE_MS))));
}

/** Groups ready for a batch: quiet for 2 minutes, or their oldest pending message is 5 minutes old. */
export async function readyGroups(now: Date) {
  const due = or(isNull(inboxMessage.nextAttemptAt), lte(inboxMessage.nextAttemptAt, now));
  const rows = await db
    .select({ groupId: inboxMessage.waGroupId, studentId: inboxMessage.studentId, newest: sql<string>`max(${inboxMessage.receivedAt})`, oldest: sql<string>`min(${inboxMessage.receivedAt})` })
    .from(inboxMessage)
    .innerJoin(user, eq(user.id, inboxMessage.studentId))
    .where(and(eq(inboxMessage.status, "pending"), BATCHABLE, due, eq(user.autoChangesPaused, false)))
    .groupBy(inboxMessage.waGroupId, inboxMessage.studentId);
  return rows.filter((r) => +now - +new Date(r.newest) >= QUIET_MS || +now - +new Date(r.oldest) >= OLDEST_MS);
}

/** Claims up to 30 pending messages of a group (oldest first) with SKIP LOCKED, so two workers never share a row. */
export async function claimBatch(studentId: string, groupId: string, now: Date) {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: inboxMessage.id })
      .from(inboxMessage)
      .where(and(eq(inboxMessage.waGroupId, groupId), eq(inboxMessage.status, "pending"), BATCHABLE, or(isNull(inboxMessage.nextAttemptAt), lte(inboxMessage.nextAttemptAt, now))))
      .orderBy(asc(inboxMessage.sentAt))
      .limit(MAX_BATCH)
      .for("update", { skipLocked: true });
    if (!rows.length) return null;
    const [batch] = await tx.insert(aiBatch).values({ studentId, waGroupId: groupId, promptVersion: PROMPT_VERSION }).returning({ id: aiBatch.id });
    await tx
      .update(inboxMessage)
      .set({ status: "processing", processingStartedAt: now, batchId: batch!.id })
      .where(inArray(inboxMessage.id, rows.map((r) => r.id)));
    return batch!.id;
  });
}

/** The context from Postgres (design §9). The current Semester and its Courses that aren't archived. */
function pgAdapter(studentId: string, groupId: string, batchIds: string[], key: Buffer, now: Date): ContextAdapter {
  const currentSemester = async () =>
    (await db.select().from(semester).where(and(eq(semester.studentId, studentId), eq(semester.isCurrent, true), isNull(semester.archivedAt))))[0];
  const courseIds = async () => {
    const s = await currentSemester();
    return s ? (await db.select({ id: course.id }).from(course).where(and(eq(course.semesterId, s.id), isNull(course.archivedAt)))).map((c) => c.id) : [];
  };
  const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
  return {
    async getSemester() {
      const s = await currentSemester();
      return s ? { id: s.id, startDate: s.startDate, endDate: s.endDate } : null;
    },
    async getCourses() {
      const ids = await courseIds();
      if (!ids.length) return [];
      const [cs, nicks] = await Promise.all([
        db.select().from(course).where(inArray(course.id, ids)),
        db.select().from(courseNickname).where(inArray(courseNickname.courseId, ids)),
      ]);
      return cs.map((c) => ({ id: c.id, code: c.code, name: c.name, nicknames: nicks.filter((n) => n.courseId === c.id).map((n) => n.nickname) }));
    },
    async getOpenAndRecentAssessments() {
      const ids = await courseIds();
      if (!ids.length) return { assignments: [], exams: [] };
      const recent = addDays(todayIn(now), -30);
      const [as, es] = await Promise.all([
        db
          .select()
          .from(assignment)
          .where(and(inArray(assignment.courseId, ids), isNull(assignment.deletedAt), or(ne(assignment.status, "submitted"), gte(assignment.submittedAt, new Date(`${recent}T00:00:00Z`))))),
        db.select().from(exam).where(and(inArray(exam.courseId, ids), isNull(exam.deletedAt))),
      ]);
      return {
        assignments: as.map((a) => ({ id: a.id, courseId: a.courseId, title: a.title, dueDate: a.dueDate, dueTime: hhmm(a.dueTime), status: a.status })),
        exams: es.map((e) => ({ id: e.id, courseId: e.courseId, title: e.title, kindLabel: e.kindLabel, date: e.date, startTime: hhmm(e.startTime) })),
      };
    },
    async getSuppressions() {
      const ids = await courseIds();
      if (!ids.length) return [];
      const rows = await db.select().from(suppression).where(inArray(suppression.courseId, ids));
      return rows.map((r) => ({ courseId: r.courseId, entityType: r.entityType as "assignment" | "exam", title: r.titleKey, dueDate: r.dueDate }));
    },
    async getRecentMessages() {
      const rows = await db
        .select()
        .from(inboxMessage)
        .where(and(eq(inboxMessage.waGroupId, groupId), eq(inboxMessage.status, "done"), inArray(inboxMessage.kind, ["text", "edit"]), gte(inboxMessage.sentAt, new Date(+now - 7 * 86_400_000))))
        .orderBy(desc(inboxMessage.sentAt))
        .limit(60);
      return rows
        .filter((r) => !batchIds.includes(r.id) && r.textEnc)
        .reverse()
        .map((r) => ({ id: r.id, sender: r.senderName, sentAt: r.sentAt.toISOString(), text: decrypt(r.textEnc!, key), decision: r.decision }));
    },
  };
}

/** Runs one claimed batch end to end. Returns what happened, for logs and tests. */
export async function runBatch(batchId: string, ai: AiClient, key: Buffer, now: Date): Promise<"applied" | "rejected" | "retry"> {
  const [batch] = await db.select().from(aiBatch).where(eq(aiBatch.id, batchId));
  const rows = await db.select().from(inboxMessage).where(eq(inboxMessage.batchId, batchId)).orderBy(asc(inboxMessage.sentAt));
  const originals = rows.filter((r) => r.editOf).map((r) => r.editOf!);
  const originalText = new Map(
    originals.length ? (await db.select().from(inboxMessage).where(inArray(inboxMessage.id, originals))).map((o) => [o.id, o.textEnc ? decrypt(o.textEnc, key) : ""]) : [],
  );
  const [group] = await db.select().from(waGroup).where(eq(waGroup.id, batch!.waGroupId));
  const messages: AiContext["messages"] = rows.map((r) => ({
    id: r.id,
    sender: r.senderName,
    sentAt: r.sentAt.toISOString(),
    kind: r.kind as "text" | "edit",
    text: r.textEnc ? decrypt(r.textEnc, key) : "",
    editOf: r.editOf ? { id: r.editOf, text: originalText.get(r.editOf) ?? "" } : null,
  }));
  const ctx = await buildContext(pgAdapter(batch!.studentId, batch!.waGroupId, rows.map((r) => r.id), key, now), {
    now,
    linkedTo: group?.linkedCourseId ? { courseId: group.linkedCourseId } : { semester: true },
    messages,
  });

  let tokens = { input: 0, output: 0 };
  const call = async (chat: Parameters<AiClient["complete"]>[0]) => {
    const r = await ai.complete(chat);
    tokens = { input: tokens.input + r.inputTokens, output: tokens.output + r.outputTokens };
    return r.content;
  };
  const ids = rows.map((r) => r.id);
  try {
    const chat = [{ role: "system" as const, content: SYSTEM_PROMPT }, { role: "user" as const, content: userPrompt(ctx) }];
    const first = await call(chat);
    let result = validateOutput(first, ctx);
    // One retry with the validation errors added (design §8), then the batch is rejected.
    if (!result.ok) result = validateOutput(await call([...chat, { role: "assistant", content: first }, { role: "user", content: repairPrompt(result.error) }]), ctx);
    const finished = { finishedAt: new Date(), modelId: ai.model, inputTokens: tokens.input, outputTokens: tokens.output };

    if (!result.ok) {
      const error = result.error;
      await db.transaction(async (tx) => {
        await tx.update(inboxMessage).set({ status: "done", decision: "rejected", possiblyMissed: true, processingStartedAt: null }).where(inArray(inboxMessage.id, ids));
        await tx.insert(activityEvent).values({ studentId: batch!.studentId, kind: "ai_output_rejected", payload: { batchId, messageIds: ids, error: error.slice(0, 500) } });
        await tx.update(aiBatch).set({ ...finished, status: "rejected", error: "output failed validation twice" }).where(eq(aiBatch.id, batchId));
      });
      return "rejected";
    }

    const { decisions, valid, dropped, overflow } = result;
    // Possibly Missed: operations that couldn't be applied. A repeat or a dismissed item was handled, not missed.
    const handled = (reason: string) => reason.startsWith("repeats") || reason.startsWith("superseded");
    const flagged = new Set([...dropped.filter((d) => !handled(d.reason)).flatMap((d) => d.messageIds), ...overflow.flatMap((o) => o.sourceMessageIds)]);
    await db.transaction(async (tx) => {
      await applyOperations(tx, { studentId: batch!.studentId, batchId, operations: valid, sentAt: new Map(rows.map((r) => [r.id, r.sentAt])), modelId: ai.model, promptVersion: PROMPT_VERSION });
      for (const r of rows) {
        const d = decisions.get(r.id) ?? { decision: "ignored" as const, reason: "no decision returned" };
        await tx
          .update(inboxMessage)
          .set({ status: "done", decision: d.decision, decisionReason: d.reason.slice(0, 300), possiblyMissed: flagged.has(r.id), processingStartedAt: null })
          .where(eq(inboxMessage.id, r.id));
      }
      if (overflow.length) await tx.insert(activityEvent).values({ studentId: batch!.studentId, kind: "ai_overflow", payload: { batchId, applied: valid.length, notApplied: overflow.length } });
      await tx.update(aiBatch).set({ ...finished, status: "applied" }).where(eq(aiBatch.id, batchId));
    });
    if (overflow.length) await raiseAlert(batch!.studentId, "ai_overflow", { batchId, notApplied: overflow.length }, now);
    return "applied";
  } catch (e) {
    // An AI outage never marks messages dead: back to pending, retried later (design §8). A fatal error also stops the loop.
    const attempts = rows[0]?.attempts ?? 0;
    const waitMin = e instanceof AiFatalError ? 0 : (BACKOFF_MIN[attempts] ?? 60);
    await db
      .update(inboxMessage)
      .set({ status: "pending", processingStartedAt: null, attempts: e instanceof AiFatalError ? attempts : attempts + 1, nextAttemptAt: new Date(+now + waitMin * 60_000) })
      .where(inArray(inboxMessage.id, ids));
    await db.update(aiBatch).set({ status: "failed", finishedAt: new Date(), error: (e as Error).message.slice(0, 300) }).where(eq(aiBatch.id, batchId));
    if (e instanceof AiFatalError || !(e instanceof AiRetryableError)) throw e;
    log.warn("ai call failed; will retry", { batchId, attempts: attempts + 1, error: (e as Error).message });
    return "retry";
  }
}

/** One AI tick (every 60 s): reset stale rows, then run every ready group. */
export async function aiTick(ai: AiClient, key: Buffer, now = new Date()) {
  await resetStale(now);
  for (const g of await readyGroups(now)) {
    const batchId = await claimBatch(g.studentId, g.groupId, now);
    if (batchId) await runBatch(batchId, ai, key, now);
  }
}
