// Claiming an email before sending it: the unique indexes on email_log make the insert the lock, so two ticks
// (or two workers during a deploy) can never both send. A failed or stuck row is reclaimed for a retry.
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailLog } from "@/server/db/schema";
import { deliver, type Message, reclaim } from "@/server/email/resend";

type Key = { studentId: string; kind: "digest" | "final_reminder"; digestDate?: string; entityType?: "assignment" | "exam"; entityId?: string; dueAt?: Date };

export async function claimAndSend(key: Key, msg: Message) {
  const [claimed] = await db
    .insert(emailLog)
    .values({ ...key, subject: msg.subject, status: "sending", attempts: 1, attemptedAt: new Date() })
    .onConflictDoNothing()
    .returning({ id: emailLog.id });
  if (claimed) return deliver(claimed.id, msg);

  const where =
    key.kind === "digest"
      ? and(eq(emailLog.studentId, key.studentId), eq(emailLog.kind, "digest"), eq(emailLog.digestDate, key.digestDate!))
      : and(eq(emailLog.kind, "final_reminder"), eq(emailLog.entityType, key.entityType!), eq(emailLog.entityId, key.entityId!), eq(emailLog.dueAt, key.dueAt!));
  const [existing] = await db.select({ id: emailLog.id }).from(emailLog).where(where);
  if (existing && (await reclaim(existing.id))) return deliver(existing.id, msg);
  return null; // already sent, being sent, or skipped
}

/** A digest day with nothing to report is recorded, so it isn't reconsidered all morning. */
export const recordSkippedDigest = (studentId: string, digestDate: string) =>
  db.insert(emailLog).values({ studentId, kind: "digest", digestDate, subject: "(nothing to report)", status: "skipped" }).onConflictDoNothing();

export async function lastDigestAt(studentId: string) {
  // Raw max() comes back as text, not a Date.
  const [row] = await db.select({ at: sql<string | null>`max(${emailLog.createdAt})` }).from(emailLog).where(and(eq(emailLog.studentId, studentId), eq(emailLog.kind, "digest")));
  return row?.at ? new Date(row.at) : null;
}
