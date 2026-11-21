// Final Reminders are calculated each tick, with no reminder table (decision U5, design file 25).
export const FINAL_REMINDER_HOURS = 4;

/** Open Deadlines whose due instant is in (now, now + 4 h]. Deadlines with no time (untimed Exams) never qualify. */
export function dueForFinalReminder<T extends { dueAt: Date | null }>(deadlines: T[], now: Date): T[] {
  const end = +now + FINAL_REMINDER_HOURS * 3_600_000;
  return deadlines.filter((d) => d.dueAt !== null && +d.dueAt > +now && +d.dueAt <= end);
}
