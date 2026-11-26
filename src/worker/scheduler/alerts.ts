// Direct alerts (design §10, file 65): an email naming the cause, and an activity_event of kind alert.
// The same cause is sent at most once every 12 hours per Student.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { activityEvent, user } from "@/server/db/schema";
import { alertEmailed, recipient } from "@/server/domain/email-settings";
import { sendEmail } from "@/server/email/resend";
import { alertEmail } from "@/server/email/templates/alert";

const CAUSES = {
  whatsapp_logged_out: {
    title: "WhatsApp logged the app out",
    whatToDo: "New announcements aren't being read. Open Settings → WhatsApp and link it again with a pairing code. If it keeps happening, check WhatsApp → Linked devices on your phone.",
  },
  whatsapp_replaced: {
    title: "another copy of the app connected to WhatsApp",
    whatToDo: "This copy stopped reading WhatsApp so the two don't fight. If you didn't start another one, unlink and link again from Settings.",
  },
  whatsapp_not_started: {
    title: "WhatsApp reading couldn't start",
    whatToDo: "The worker couldn't start reading WhatsApp (for example, the encryption key is missing). It retries every 5 minutes; check the server's .env.",
  },
  whatsapp_mismatch: {
    title: "WhatsApp refused the connection",
    whatToDo: "WhatsApp reported a multi-device mismatch. Unlink from Settings, then link again with a pairing code.",
  },
  ai_overflow: {
    title: "one batch of messages asked for too many changes",
    whatToDo: "The AI applied the first 10 changes and flagged the rest. Check the Activity Log for what was applied and what wasn't.",
  },
  ai_auth: {
    title: "the AI service refused the key or the model",
    whatToDo: "Auto Changes have stopped; messages are queued. Check NIM_API_KEY and NIM_MODEL in the server's .env (the key may be refused, or the model no longer offered). The AI checks again every 5 minutes.",
  },
  ai_outage: {
    title: "the AI service has been failing for over an hour",
    whatToDo: "NVIDIA NIM keeps timing out or refusing (busy or down). Auto Changes are delayed; messages are queued and retried every hour, and nothing is lost. If it lasts, check NIM's status page.",
  },
  final_reminder_undeliverable: {
    title: "a Final Reminder couldn't be sent",
    whatToDo: "A reminder email failed until its Deadline passed. Check the dashboard for what's due, and check the Resend key and account.",
  },
} as const;
export type AlertCause = keyof typeof CAUSES;
const RETRIED_BY_TICK = new Set<AlertCause>(["final_reminder_undeliverable"]);

/** Returns true when the alert was raised, false when the same cause was already raised in the last 12 hours. */
export async function raiseAlert(studentId: string, cause: AlertCause, detail: Record<string, unknown>, now: Date) {
  const raised = await db.transaction(async (tx) => {
    // One alert decision at a time per Student and cause.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`alert:${studentId}:${cause}`}))`);
    const [recent] = await tx
      .select({ id: activityEvent.id })
      .from(activityEvent)
      .where(and(eq(activityEvent.studentId, studentId), eq(activityEvent.kind, "alert"), sql`${activityEvent.payload}->>'cause' = ${cause}`, gt(activityEvent.createdAt, new Date(+now - 12 * 3_600_000))));
    if (recent) return null;
    const [row] = await tx.insert(activityEvent).values({ studentId, kind: "alert", payload: { cause, ...detail }, createdAt: now }).returning({ id: activityEvent.id });
    return row!.id;
  });
  if (!raised) return false;
  const [s] = await db.select({ email: user.email, notifyEmail: user.notifyEmail, alertsOff: user.alertsOff }).from(user).where(eq(user.id, studentId));
  // A kind the Student turned off stays in the Activity Log, unemailed (#82).
  if (s && !alertEmailed(cause, s.alertsOff)) return true;
  const { title, whatToDo } = CAUSES[cause];
  const res = s ? await sendEmail(studentId, "alert", { to: recipient(s), ...alertEmail(title, whatToDo, process.env.APP_ORIGIN ?? "") }) : null;
  // If the email didn't go out and a later tick will raise this cause again, forget it so that tick retries;
  // one-off causes (a logout) stay recorded in the Activity Log either way.
  if (res && !res.ok && RETRIED_BY_TICK.has(cause)) await db.delete(activityEvent).where(eq(activityEvent.id, raised));
  return true;
}
