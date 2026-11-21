// Direct alerts (design §10, file 65): an email naming the cause, and an activity_event of kind alert.
// The same cause is sent at most once every 12 hours per Student.
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { activityEvent, user } from "@/server/db/schema";
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
  whatsapp_mismatch: {
    title: "WhatsApp refused the connection",
    whatToDo: "WhatsApp reported a multi-device mismatch. Unlink from Settings, then link again with a pairing code.",
  },
  final_reminder_undeliverable: {
    title: "a Final Reminder couldn't be sent",
    whatToDo: "A reminder email failed until its Deadline passed. Check the dashboard for what's due, and check the Resend key and account.",
  },
} as const;
export type AlertCause = keyof typeof CAUSES;

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
  const [s] = await db.select({ email: user.email }).from(user).where(eq(user.id, studentId));
  const { title, whatToDo } = CAUSES[cause];
  const res = s ? await sendEmail(studentId, "alert", { to: s.email, ...alertEmail(title, whatToDo, process.env.APP_ORIGIN ?? "") }) : null;
  // If the email didn't go out, forget this alert so the next tick tries again, instead of waiting 12 hours.
  if (res && !res.ok) await db.delete(activityEvent).where(eq(activityEvent.id, raised));
  return true;
}
