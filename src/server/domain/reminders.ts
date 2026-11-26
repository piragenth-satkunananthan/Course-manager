// Final Reminders are calculated each tick, with no reminder table (decision U5, design file 25). Lead times, the
// digest time and quiet hours are the Student's settings (U44, #79), defaulting to the original behaviour.
import { instantToLocal } from "./time";

export type NotifyPrefs = {
  digestOn: boolean;
  digestTime: string; // HH:mm
  digestDays: number;
  reminderHours: number;
  secondReminderHours: number | null;
  quietStart: string | null;
  quietEnd: string | null;
};
export const DEFAULT_NOTIFY: NotifyPrefs = { digestOn: true, digestTime: "07:00", digestDays: 2, reminderHours: 4, secondReminderHours: null, quietStart: null, quietEnd: null };
export const FINAL_REMINDER_HOURS = DEFAULT_NOTIFY.reminderHours;

/** Open Deadlines whose due instant is in (now, now + lead time]. Deadlines with no time (untimed Exams) never qualify. */
export function dueForFinalReminder<T extends { dueAt: Date | null }>(deadlines: T[], now: Date, prefs: NotifyPrefs = DEFAULT_NOTIFY): T[] {
  const end = +now + prefs.reminderHours * 3_600_000;
  return deadlines.filter((d) => d.dueAt !== null && +d.dueAt > +now && +d.dueAt <= end);
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
/** Whether a Colombo clock time is inside quiet hours (which may cross midnight). */
export function inQuietHours(hhmm: string, prefs: Pick<NotifyPrefs, "quietStart" | "quietEnd">) {
  if (!prefs.quietStart || !prefs.quietEnd) return false;
  const [t, s, e] = [minutes(hhmm), minutes(prefs.quietStart), minutes(prefs.quietEnd)];
  return s <= e ? t >= s && t < e : t >= s || t < e;
}
export { minutes as clockMinutes };

/** The digest goes out within two hours of its chosen time, when it's on. */
export function isDigestDue(now: Date, prefs: NotifyPrefs = DEFAULT_NOTIFY) {
  if (!prefs.digestOn) return false;
  const t = minutes(instantToLocal(now).time) - minutes(prefs.digestTime);
  return t >= 0 && t < 120;
}

/**
 * When a reminder `hours` before `dueAt` is sent: that instant, or, if it falls in quiet hours, the start of those
 * quiet hours (so it comes before them, never after).
 */
function sendAt(dueAt: Date, hours: number, prefs: NotifyPrefs): number {
  const at = +dueAt - hours * 3_600_000;
  const { time } = instantToLocal(new Date(at));
  if (!inQuietHours(time, prefs)) return at;
  const back = (minutes(time) - minutes(prefs.quietStart!) + 1440) % 1440; // minutes since quiet hours began
  return at - back * 60_000 - (at % 60_000);
}

/** The reminders due now: the Final Reminder from its send time until the Deadline, and the optional second reminder until the Final Reminder's send time. */
export function remindersDue<T extends { dueAt: Date | null }>(deadlines: T[], now: Date, prefs: NotifyPrefs = DEFAULT_NOTIFY) {
  // `hours`: how far ahead of the Deadline it was meant to go out (more than the lead time when quiet hours moved it earlier).
  const out: { item: T; kind: "final" | "second"; hours: number }[] = [];
  const ahead = (dueAt: Date, at: number) => Math.round((+dueAt - at) / 3_600_000);
  for (const item of deadlines) {
    if (!item.dueAt || +item.dueAt <= +now) continue;
    const final = sendAt(item.dueAt, prefs.reminderHours, prefs);
    const second = prefs.secondReminderHours ? sendAt(item.dueAt, prefs.secondReminderHours, prefs) : null;
    if (+now >= final) out.push({ item, kind: "final", hours: ahead(item.dueAt, final) });
    else if (second !== null && +now >= second) out.push({ item, kind: "second", hours: ahead(item.dueAt, second) });
  }
  return out;
}

/** Rules across fields that a single field's check can't see; field name → message. Empty when the settings are fine. */
export function notifyProblems(p: NotifyPrefs): Partial<Record<keyof NotifyPrefs, string>> {
  const out: Partial<Record<keyof NotifyPrefs, string>> = {};
  if (!!p.quietStart !== !!p.quietEnd) out[p.quietStart ? "quietEnd" : "quietStart"] = p.quietStart ? "Choose when quiet hours end" : "Choose when quiet hours start";
  else if (p.quietStart && p.quietStart === p.quietEnd) out.quietEnd = "Quiet hours must end at a different time";
  else if (p.digestOn && inQuietHours(p.digestTime, p)) out.digestTime = "The digest can't be sent during quiet hours";
  if (p.secondReminderHours && p.secondReminderHours <= p.reminderHours) out.secondReminderHours = "The second reminder must come before the Final Reminder";
  return out;
}
