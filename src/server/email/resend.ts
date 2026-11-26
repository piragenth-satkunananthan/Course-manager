// Email through Resend's HTTPS API (design file 35). The email_log row is claimed before the call. The
// Idempotency-Key is the row id plus the attempt number: Resend rejects a reused key with a different payload (409),
// and a retry rebuilds the email, so each attempt gets its own key. Never throws.
import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailLog, healthSignal } from "@/server/db/schema";
import { log } from "@/server/log";

export type Message = { to: string; subject: string; html: string; text: string };

/** For one-off emails from the web app (password reset, account deletion in #17): log the row, then send. */
export async function sendEmail(studentId: string, kind: "alert" | "password_reset" | "account_deleted" | "email_confirm", msg: Message) {
  const [row] = await db.insert(emailLog).values({ studentId, kind, subject: msg.subject, status: "sending", attempts: 1, attemptedAt: new Date() }).returning({ id: emailLog.id });
  return deliver(row!.id, msg);
}

/** Sends one claimed email_log row and records the outcome. */
export async function deliver(logId: string, msg: Message): Promise<{ ok: true; providerMessageId: string } | { ok: false; error: string }> {
  const [{ attempts } = { attempts: 1 }] = await db.select({ attempts: emailLog.attempts }).from(emailLog).where(eq(emailLog.id, logId));
  const base = process.env.EMAIL_API_BASE_URL ?? "https://api.resend.com";
  let error: string;
  try {
    const res = await fetch(`${base}/emails`, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, "content-type": "application/json", "idempotency-key": `${logId}:${attempts}` },
      body: JSON.stringify({ from: process.env.EMAIL_FROM ?? "Course-manager <onboarding@resend.dev>", to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text }),
      signal: AbortSignal.timeout(20_000),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (res.ok && body.id) {
      await db.update(emailLog).set({ status: "sent", providerMessageId: body.id, sentAt: new Date(), error: null }).where(eq(emailLog.id, logId));
      await signal("ok");
      return { ok: true, providerMessageId: body.id };
    }
    error = `HTTP ${res.status}: ${body.message ?? "no message"}`;
  } catch (e) {
    error = (e as Error).message;
  }
  await db.update(emailLog).set({ status: "failed", error }).where(eq(emailLog.id, logId));
  await signal("error", error);
  log.warn("email failed", { logId, error });
  return { ok: false, error };
}

async function signal(outcome: "ok" | "error", detail?: string) {
  const now = new Date();
  const set = outcome === "ok" ? { lastOkAt: now } : { lastErrorAt: now, detail };
  await db.insert(healthSignal).values({ component: "email", ...set }).onConflictDoUpdate({ target: healthSignal.component, set });
}

/**
 * Marks a row as being sent again: a failed one, or one stuck in `sending` for 2 minutes (a crash mid-send; a send
 * times out after 20 s). shortcut: a crash after Resend accepted but before the row was updated can send twice.
 */
export async function reclaim(logId: string) {
  const [row] = await db
    .update(emailLog)
    .set({ status: "sending", attempts: sql`${emailLog.attempts} + 1`, attemptedAt: new Date() })
    .where(sql`${emailLog.id} = ${logId} and (${emailLog.status} = 'failed' or (${emailLog.status} = 'sending' and ${emailLog.attemptedAt} < now() - interval '2 minutes'))`)
    .returning({ id: emailLog.id });
  return !!row;
}
