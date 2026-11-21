// The scheduler's jobs (design file 65). Each takes `now`, so tests can drive them with an injected clock.
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { loadOpenDeadlines } from "@/server/data/assessments";
import { db } from "@/server/db/client";
import { emailLog, entityVersion, user } from "@/server/db/schema";
import { isDigestWindow, selectDigest } from "@/server/domain/digest";
import { dueForFinalReminder } from "@/server/domain/reminders";
import { todayIn } from "@/server/domain/time";
import { digestEmail } from "@/server/email/templates/digest";
import { finalReminderEmail } from "@/server/email/templates/final-reminder";
import { formatDate } from "@/lib/format";
import { raiseAlert } from "./alerts";
import { claimAndSend, lastDigestAt, recordSkippedDigest } from "./claim";

const origin = () => process.env.APP_ORIGIN ?? "";
const students = () => db.select({ id: user.id, email: user.email }).from(user);

/** Open Deadlines due in the next 4 hours with no reminder logged for their current due instant (a moved one gets a new one). */
export async function runFinalReminders(now: Date) {
  for (const s of await students()) {
    const due = dueForFinalReminder(await loadOpenDeadlines(s.id, { examsFrom: todayIn(now), includeTba: false }), now);
    for (const d of due) {
      await claimAndSend(
        { studentId: s.id, kind: "final_reminder", entityType: d.deadline.type, entityId: d.id, dueAt: d.dueAt! },
        { to: s.email, ...finalReminderEmail(d.deadline, origin()) },
      );
    }
    // A reminder still failed when its Deadline arrived: give up on it and alert (§10).
    const [given] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailLog)
      .where(and(eq(emailLog.studentId, s.id), eq(emailLog.kind, "final_reminder"), eq(emailLog.status, "failed"), sql`${emailLog.dueAt} <= ${now}`, sql`${emailLog.dueAt} > ${new Date(+now - 86_400_000)}`));
    if (given && given.n > 0) await raiseAlert(s.id, "final_reminder_undeliverable", { count: given.n }, now);
  }
}

/** At most one digest a day, only 07:00–08:59; a day with nothing to report is recorded as skipped. */
export async function runDigest(now: Date) {
  if (!isDigestWindow(now)) return;
  const today = todayIn(now);
  for (const s of await students()) {
    const open = await loadOpenDeadlines(s.id, { examsFrom: today, includeTba: false });
    // Added or moved since the last digest: creates, and edits or undos that touched a due date or time. Before the
    // first digest, everything still open is new.
    const since = (await lastDigestAt(s.id, today)) ?? new Date(0);
    const changed = open.length
      ? await db
          .selectDistinct({ id: entityVersion.entityId })
          .from(entityVersion)
          .where(
            and(
              eq(entityVersion.studentId, s.id),
              inArray(entityVersion.entityId, open.map((d) => d.id)),
              gt(entityVersion.createdAt, since),
              sql`(${entityVersion.op} = 'create' or (${entityVersion.op} in ('update', 'undo') and ${entityVersion.after} ?| array['dueDate','dueTime','date','startTime']))`,
            ),
          )
      : [];
    const sections = selectDigest(open, new Set(changed.map((c) => c.id)), today);
    if (!sections) {
      await recordSkippedDigest(s.id, today);
      continue;
    }
    const email = digestEmail({ dueSoon: sections.dueSoon.map((d) => d.deadline), addedOrMoved: sections.addedOrMoved.map((d) => d.deadline) }, formatDate(today), origin());
    await claimAndSend({ studentId: s.id, kind: "digest", digestDate: today }, { to: s.email, ...email });
  }
}
