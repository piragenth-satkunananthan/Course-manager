// The scheduler's jobs (design file 65). Each takes `now`, so tests can drive them with an injected clock.
import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { decrypt, loadKey } from "@/server/crypto";
import { loadOpenDeadlines } from "@/server/data/assessments";
import { db } from "@/server/db/client";
import { autoChange, emailLog, entityVersion, inboxMessage, unknownCourseMention, user, waGroup } from "@/server/db/schema";
import { type CheckTheseInput, isDigestWindow, selectDigest } from "@/server/domain/digest";
import { remindersDue } from "@/server/domain/reminders";
import { getNotify } from "@/server/data/settings";
import { todayIn } from "@/server/domain/time";
import { digestEmail } from "@/server/email/templates/digest";
import { finalReminderEmail } from "@/server/email/templates/final-reminder";
import { formatDate } from "@/lib/format";
import { raiseAlert } from "./alerts";
import { claimAndSend, lastDigestAt, recordSkippedDigest } from "./claim";

const origin = () => process.env.APP_ORIGIN ?? "";
const students = () => db.select({ id: user.id, email: user.email, paused: user.autoChangesPaused }).from(user);

/** Check these (#14): risky changes not undone and Possibly Missed messages since the last digest, and every open Unknown Course. */
async function loadCheckThese(studentId: string, since: Date, paused: boolean): Promise<CheckTheseInput> {
  const key = loadKey();
  const [riskyChanges, missed, unknownCourses] = await Promise.all([
    db
      .select({ summary: autoChange.summary, risk: autoChange.risk })
      .from(autoChange)
      .where(and(eq(autoChange.studentId, studentId), ne(autoChange.risk, "normal"), isNull(autoChange.undoneAt), gt(autoChange.createdAt, since)))
      .orderBy(autoChange.createdAt),
    db
      .select({ senderName: inboxMessage.senderName, groupSubject: waGroup.subject, textEnc: inboxMessage.textEnc })
      .from(inboxMessage)
      .innerJoin(waGroup, eq(waGroup.id, inboxMessage.waGroupId))
      .where(and(eq(inboxMessage.studentId, studentId), eq(inboxMessage.possiblyMissed, true), isNull(inboxMessage.revokedAt), gt(inboxMessage.possiblyMissedAt, since)))
      .orderBy(inboxMessage.sentAt),
    db.select({ name: unknownCourseMention.name }).from(unknownCourseMention).where(and(eq(unknownCourseMention.studentId, studentId), eq(unknownCourseMention.status, "open"))).orderBy(unknownCourseMention.createdAt),
  ]);
  const possiblyMissed = missed.map((m) => ({ senderName: m.senderName, groupSubject: m.groupSubject, text: m.textEnc ? decrypt(m.textEnc, key) : null }));
  return { riskyChanges, possiblyMissed, unknownCourses, paused };
}

/**
 * Open Deadlines whose reminder is due (the Student's lead time, an optional second reminder, quiet hours; U44), with
 * no reminder of that kind logged for their current due instant (a moved one gets a new one).
 */
export async function runFinalReminders(now: Date) {
  for (const s of await students()) {
    const prefs = await getNotify(s.id);
    const due = remindersDue(await loadOpenDeadlines(s.id, { examsFrom: todayIn(now), includeTba: false }), now, prefs);
    for (const { item: d, kind, hours } of due) {
      await claimAndSend(
        { studentId: s.id, kind: kind === "final" ? "final_reminder" : "second_reminder", entityType: d.deadline.type, entityId: d.id, dueAt: d.dueAt! },
        { to: s.email, ...finalReminderEmail(d.deadline, origin(), hours) },
      );
    }
    // A reminder still failed when its Deadline arrived: give up on it and alert (§10). Failures from the last day count,
    // so each is alerted at most twice (at its due instant and 12 hours later).
    const [givenUp] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(emailLog)
      .where(and(eq(emailLog.studentId, s.id), eq(emailLog.kind, "final_reminder"), eq(emailLog.status, "failed"), sql`${emailLog.dueAt} <= ${now}`, sql`${emailLog.dueAt} > ${new Date(+now - 86_400_000)}`));
    if (givenUp && givenUp.n > 0) await raiseAlert(s.id, "final_reminder_undeliverable", { count: givenUp.n }, now);
  }
}

/** At most one digest a day, within two hours of the Student's digest time (07:00 by default; U44); a day with nothing to report is recorded as skipped. */
export async function runDigest(now: Date) {
  const today = todayIn(now);
  for (const s of await students()) {
    const prefs = await getNotify(s.id);
    if (!isDigestWindow(now, prefs)) continue;
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
    const sections = selectDigest(open, new Set(changed.map((c) => c.id)), today, await loadCheckThese(s.id, since, s.paused), prefs.digestDays);
    if (!sections) {
      await recordSkippedDigest(s.id, today);
      continue;
    }
    const email = digestEmail({ dueSoon: sections.dueSoon.map((d) => d.deadline), addedOrMoved: sections.addedOrMoved.map((d) => d.deadline), checkThese: sections.checkThese }, formatDate(today), origin());
    await claimAndSend({ studentId: s.id, kind: "digest", digestDate: today }, { to: s.email, ...email });
  }
}
