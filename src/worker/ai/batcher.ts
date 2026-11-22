// The AI processor (design §8, file 64): picks batches per group, builds the context, calls the AI, validates, and
// applies everything in one transaction. Message text is decrypted only in memory and never logged.
import { and, asc, eq, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { applyOperations } from "@/server/ai/apply-operations";
import { type AiContext, buildContext } from "@/server/ai/context";
import { pgAdapter } from "@/server/data/ai-context";
import { isHandled, SUPERSEDED, type Validated, validateOutput } from "@/server/ai/validate";
import { decrypt } from "@/server/crypto";
import { db, type Tx } from "@/server/db/client";
import { activityEvent, aiBatch, inboxMessage, unknownCourseMention, user, waGroup } from "@/server/db/schema";
import { looksLikeDeadline } from "@/server/domain/possibly-missed";
import { log } from "@/server/log";
import { raiseAlert } from "../scheduler/alerts";
import { processDeletes, undoEditedOriginals } from "./edits";
import { type AiClient, AiFatalError, AiRetryableError } from "./nim-client";
import { PROMPT_VERSION, repairPrompt, SYSTEM_PROMPT, userPrompt } from "./prompt";

const QUIET_MS = 2 * 60_000;
const OLDEST_MS = 5 * 60_000;
const STALE_MS = 10 * 60_000;
const MAX_BATCH = 30;
const BACKOFF_MIN = [1, 5, 15, 60]; // then hourly
const OUTAGE_ALERT_MS = 60 * 60_000;
const PREVIEW = new Error("preview only: rolled back");
// Deletes (revoke rows) never go to the AI: processDeletes handles them.
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

/** Possibly Missed by decision (design §9): the AI said so, or it set aside a message that reads like a deadline. */
const isPossiblyMissed = (decision: string, text: string) => decision === "possibly_missed" || ((decision === "ignored" || decision === "question") && looksLikeDeadline(text));

export const nameKey = (name: string) => name.trim().replace(/\s+/g, " ").toLowerCase();

/** One entry per name: a repeat while open appends; a resolved name opens again with the new operations; ignored stays quiet. */
async function recordUnknownCourses(tx: Tx, studentId: string, batchId: string, unknown: Extract<Validated, { ok: true }>["unknownCourses"], batchIds: Set<string>) {
  for (const u of unknown) {
    const key = nameKey(u.name);
    if (!key) continue;
    const ops = u.proposedOperations.map((op) => ({ batchId, op }));
    const first = u.messageIds.find((id) => batchIds.has(id)) ?? null;
    const t = unknownCourseMention; // short, for the case expressions below
    await tx
      .insert(t)
      .values({ studentId, name: u.name.trim(), nameKey: key, firstMessageId: first, pendingOps: ops })
      .onConflictDoUpdate({
        target: [t.studentId, t.nameKey],
        set: {
          pendingOps: sql`case ${t.status} when 'ignored' then ${t.pendingOps} when 'open' then ${t.pendingOps} || excluded.pending_ops else excluded.pending_ops end`,
          firstMessageId: sql`case when ${t.status} in ('added', 'mapped') then excluded.first_message_id else ${t.firstMessageId} end`,
          courseId: sql`case when ${t.status} in ('added', 'mapped') then null else ${t.courseId} end`,
          resolvedAt: sql`case when ${t.status} in ('added', 'mapped') then null else ${t.resolvedAt} end`,
          createdAt: sql`case when ${t.status} in ('added', 'mapped') then now() else ${t.createdAt} end`, // reopened: shown as new
          status: sql`case when ${t.status} = 'ignored' then 'ignored'::unknown_course_status else 'open'::unknown_course_status end`,
        },
      });
  }
}

/** Runs one claimed batch end to end. Returns what happened, for logs and tests. */
export async function runBatch(batchId: string, ai: AiClient, key: Buffer, now: Date): Promise<"applied" | "rejected" | "retry"> {
  const [batch] = await db.select().from(aiBatch).where(eq(aiBatch.id, batchId));
  const claimed = await db.select().from(inboxMessage).where(eq(inboxMessage.batchId, batchId)).orderBy(asc(inboxMessage.sentAt));
  // A message deleted after it was claimed (say, before a crash) never reaches the AI, nor do edits of it.
  const revokedIds = new Set(claimed.filter((r) => r.revokedAt).map((r) => r.id));
  const editOfIds = claimed.flatMap((r) => (r.editOf ? [r.editOf] : []));
  if (editOfIds.length)
    for (const o of await db.select({ id: inboxMessage.id }).from(inboxMessage).where(and(inArray(inboxMessage.id, editOfIds), isNotNull(inboxMessage.revokedAt)))) revokedIds.add(o.id);
  const skipped = claimed.filter((r) => revokedIds.has(r.id) || (r.editOf && revokedIds.has(r.editOf)));
  if (skipped.length)
    await db.update(inboxMessage).set({ status: "done", decision: "ignored", decisionReason: "deleted before it was read", processingStartedAt: null }).where(inArray(inboxMessage.id, skipped.map((r) => r.id)));
  const rows = claimed.filter((r) => !skipped.includes(r));
  if (!rows.length) {
    await db.update(aiBatch).set({ status: "applied", finishedAt: new Date() }).where(eq(aiBatch.id, batchId));
    return "applied";
  }
  const edits = rows.filter((r) => r.kind === "edit");
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
  // An edit first withdraws what its original did, so the AI reads it against the earlier state (design §9). That
  // Undo is only previewed here and rolled back; it commits with the batch's apply, so a rejected batch loses nothing.
  let ctx!: AiContext;
  await db
    .transaction(async (tx) => {
      await undoEditedOriginals(tx, batch!.studentId, edits);
      ctx = await buildContext(pgAdapter(tx, batch!.studentId, batch!.waGroupId, rows.map((r) => r.id), key, now), {
        now,
        linkedTo: group?.linkedCourseId ? { courseId: group.linkedCourseId } : { semester: true },
        messages,
      });
      throw PREVIEW;
    })
    .catch((e) => {
      if (e !== PREVIEW) throw e;
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
        await tx.update(inboxMessage).set({ status: "done", decision: "rejected", possiblyMissed: true, possiblyMissedAt: new Date(), processingStartedAt: null }).where(inArray(inboxMessage.id, ids));
        // The validation error can quote the AI output, and so message text: it isn't stored (design §10).
        await tx.insert(activityEvent).values({ studentId: batch!.studentId, kind: "ai_output_rejected", payload: { batchId, messageIds: ids } });
        log.warn("ai output rejected", { batchId, errorLength: error.length });
        await tx.update(aiBatch).set({ ...finished, status: "rejected", error: "output failed validation twice" }).where(eq(aiBatch.id, batchId));
      });
      return "rejected";
    }

    const { decisions, valid, dropped, overflow, unknownCourses } = result;
    // Possibly Missed: operations that couldn't be applied. A repeat or a dismissed item was handled, not missed.
    const superseded = new Set(dropped.filter((d) => d.reason === SUPERSEDED).flatMap((d) => d.messageIds));
    const flagged = new Set([...dropped.filter((d) => !isHandled(d.reason)).flatMap((d) => d.messageIds), ...overflow.flatMap((o) => o.sourceMessageIds)]);
    const textOf = new Map(messages.map((m) => [m.id, m.text]));
    await db.transaction(async (tx) => {
      await undoEditedOriginals(tx, batch!.studentId, edits);
      await recordUnknownCourses(tx, batch!.studentId, batchId, unknownCourses, new Set(ids));
      await applyOperations(tx, { studentId: batch!.studentId, batchId, operations: valid, sentAt: new Map(rows.map((r) => [r.id, r.sentAt])), modelId: ai.model, promptVersion: PROMPT_VERSION });
      for (const r of rows) {
        const d = superseded.has(r.id)
          ? { decision: "superseded" as const, reason: SUPERSEDED }
          : (decisions.get(r.id) ?? { decision: "ignored" as const, reason: "no decision returned" });
        const flag = flagged.has(r.id) || isPossiblyMissed(d.decision, textOf.get(r.id) ?? "");
        await tx
          .update(inboxMessage)
          .set({ status: "done", decision: d.decision, decisionReason: d.reason.slice(0, 300), possiblyMissed: flag, possiblyMissedAt: flag ? new Date() : null, processingStartedAt: null })
          .where(eq(inboxMessage.id, r.id));
      }
      if (overflow.length) await tx.insert(activityEvent).values({ studentId: batch!.studentId, kind: "ai_overflow", payload: { batchId, applied: valid.length, notApplied: overflow.length } });
      await tx.update(aiBatch).set({ ...finished, status: "applied" }).where(eq(aiBatch.id, batchId));
    });
    if (overflow.length) await raiseAlert(batch!.studentId, "ai_overflow", { batchId, notApplied: overflow.length }, now);
    return "applied";
  } catch (e) {
    if (!(e instanceof AiFatalError || e instanceof AiRetryableError)) {
      // Not the AI: applying failed and rolled back. Retrying would fail the same way, so flag the messages.
      await db.update(inboxMessage).set({ status: "done", decision: "rejected", possiblyMissed: true, possiblyMissedAt: new Date(), processingStartedAt: null }).where(inArray(inboxMessage.id, ids));
      await db.insert(activityEvent).values({ studentId: batch!.studentId, kind: "ai_output_rejected", payload: { batchId, messageIds: ids } });
      await db.update(aiBatch).set({ status: "failed", finishedAt: new Date(), error: (e as Error).message.slice(0, 300) }).where(eq(aiBatch.id, batchId));
      log.error("applying ai output failed", { batchId, error: (e as Error).message });
      return "rejected";
    }
    // An AI outage never marks messages dead: back to pending, retried later (design §8). A fatal error also stops the loop.
    const attempts = rows[0]?.attempts ?? 0;
    const waitMin = e instanceof AiFatalError ? 0 : (BACKOFF_MIN[attempts] ?? 60);
    await db
      .update(inboxMessage)
      .set({ status: "pending", processingStartedAt: null, attempts: e instanceof AiFatalError ? attempts : attempts + 1, nextAttemptAt: new Date(+now + waitMin * 60_000) })
      .where(inArray(inboxMessage.id, ids));
    await db.update(aiBatch).set({ status: "failed", finishedAt: new Date(), error: (e as Error).message.slice(0, 300) }).where(eq(aiBatch.id, batchId));
    if (e instanceof AiFatalError) throw e;
    log.warn("ai call failed; will retry", { batchId, attempts: attempts + 1, error: (e as Error).message });
    // Failing for over an hour (design §10): measured from the oldest message, which has waited since about the first failure.
    const oldest = Math.min(...rows.map((r) => +r.receivedAt));
    if (+now - oldest > OUTAGE_ALERT_MS) await raiseAlert(batch!.studentId, "ai_outage", { attempts: attempts + 1 }, now);
    return "retry";
  }
}

/** One AI tick (every 60 s): reset stale rows, handle deletes, then run every ready group. */
export async function aiTick(ai: AiClient, key: Buffer, now = new Date()) {
  await resetStale(now);
  await processDeletes();
  for (const g of await readyGroups(now)) {
    const batchId = await claimBatch(g.studentId, g.groupId, now);
    if (batchId) await runBatch(batchId, ai, key, now);
  }
}
