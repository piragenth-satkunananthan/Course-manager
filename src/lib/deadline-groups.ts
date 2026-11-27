// The Deadlines list's groups (design-system §7.3, #21). Pure, so it's unit-tested. "This week" is today until
// Sunday (product owner, 2026-11-22).
import { type WeekStart, weekStartOf } from "@/server/domain/defaults";
import { addDays, localToInstant } from "@/server/domain/time";
import type { Deadline } from "@/shared/schemas/dashboard";
import { deadlineDate, isOverdueDeadline } from "./deadline-date";

export type DeadlineGroups = { overdue: Deadline[]; thisWeek: Deadline[]; later: Deadline[]; earlier: Deadline[]; tba: Deadline[] };

// By due instant (UTC); an untimed Exam (no dueAt) at 23:59 Colombo on its day, as an instant too.
const key = (d: Deadline) => d.item.dueAt ?? localToInstant(deadlineDate(d) ?? "9999-12-31", "23:59").toISOString();
const soonest = (x: Deadline, y: Deadline) => key(x).localeCompare(key(y));

export function groupDeadlines(items: Deadline[], now: Date, today: string, weekStart: WeekStart = "monday"): DeadlineGroups {
  const weekEnd = addDays(weekStartOf(today, weekStart), 6); // the week's last day (Sunday by default; #83)
  const g: DeadlineGroups = { overdue: [], thisWeek: [], later: [], earlier: [], tba: [] };
  for (const d of items) {
    const date = deadlineDate(d);
    if (isOverdueDeadline(d, now)) g.overdue.push(d);
    else if (!date) g.tba.push(d);
    else if (date < today) g.earlier.push(d); // submitted Assignments and held Exams
    else if (date <= weekEnd) g.thisWeek.push(d);
    else g.later.push(d);
  }
  g.overdue.sort(soonest);
  g.thisWeek.sort(soonest);
  g.later.sort(soonest);
  g.earlier.sort((x, y) => soonest(y, x)); // newest first
  return g;
}
