// The Deadlines list's groups (design-system §7.3, #21). Pure, so it's unit-tested. "This week" is today until
// Sunday (product owner, 2026-11-22).
import { addDays, weekdayOf } from "@/server/domain/time";
import type { Deadline } from "@/shared/schemas/dashboard";
import { deadlineDate, isOverdueDeadline } from "./deadline-date";

export type DeadlineGroups = { overdue: Deadline[]; thisWeek: Deadline[]; later: Deadline[]; earlier: Deadline[]; tba: Deadline[] };

// By due instant; an untimed Exam (no dueAt) at the end of its day.
const key = (d: Deadline) => d.item.dueAt ?? `${deadlineDate(d) ?? "9999-12-31"}T23:59`;
const soonest = (x: Deadline, y: Deadline) => key(x).localeCompare(key(y));

export function groupDeadlines(items: Deadline[], now: Date, today: string): DeadlineGroups {
  const sunday = addDays(today, 7 - weekdayOf(today));
  const g: DeadlineGroups = { overdue: [], thisWeek: [], later: [], earlier: [], tba: [] };
  for (const d of items) {
    const date = deadlineDate(d);
    if (isOverdueDeadline(d, now)) g.overdue.push(d);
    else if (!date) g.tba.push(d);
    else if (date < today) g.earlier.push(d); // submitted Assignments and held Exams
    else if (date <= sunday) g.thisWeek.push(d);
    else g.later.push(d);
  }
  g.overdue.sort(soonest);
  g.thisWeek.sort(soonest);
  g.later.sort(soonest);
  g.earlier.sort((x, y) => soonest(y, x)); // newest first
  return g;
}
