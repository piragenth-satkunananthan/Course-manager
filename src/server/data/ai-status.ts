// The Settings AI section (#80): the AI loop's health signal, the Student's waiting messages and recent batches.
import { and, desc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { aiBatch, healthSignal, inboxMessage, user } from "@/server/db/schema";
import { aiStatus } from "@/server/domain/ai-status";
import type { AiStatus } from "@/shared/schemas/ai";
import { getNimConfig } from "./nim";

export async function getAiStatus(studentId: string, now = new Date()): Promise<AiStatus> {
  const [[signal], [w], [p], [ok], [failed]] = await Promise.all([
    db.select({ lastOkAt: healthSignal.lastOkAt, lastErrorAt: healthSignal.lastErrorAt, detail: healthSignal.detail }).from(healthSignal).where(eq(healthSignal.component, "ai")),
    db
      .select({ n: sql<number>`count(*)::int`, oldest: sql<string | null>`min(${inboxMessage.receivedAt})` })
      .from(inboxMessage)
      .where(and(eq(inboxMessage.studentId, studentId), inArray(inboxMessage.status, ["pending", "processing"]))),
    db.select({ paused: user.autoChangesPaused }).from(user).where(eq(user.id, studentId)),
    db.select({ at: aiBatch.finishedAt }).from(aiBatch).where(and(eq(aiBatch.studentId, studentId), eq(aiBatch.status, "applied"))).orderBy(desc(aiBatch.finishedAt)).limit(1),
    db.select({ error: aiBatch.error }).from(aiBatch).where(and(eq(aiBatch.studentId, studentId), isNotNull(aiBatch.error), gt(aiBatch.startedAt, new Date(+now - 86_400_000)))).orderBy(desc(aiBatch.startedAt)).limit(1),
  ]);
  const status = aiStatus({
    signal,
    paused: !!p?.paused,
    waiting: w?.n ?? 0,
    oldestWaitingMs: w?.oldest ? +now - +new Date(w.oldest) : null,
    lastSuccessAt: ok?.at ?? null,
    lastBatchError: failed?.error ?? null,
  });
  return { ...status, model: (await getNimConfig(studentId)).model || null };
}
