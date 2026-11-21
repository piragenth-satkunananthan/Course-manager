// Deadlines are a view over Assignments and Exams (design §3, file 23).
import { addDays, localToInstant, todayIn } from "./time";

export type DeadlineInput =
  | { type: "assignment"; id: string; dueDate: string; dueTime: string | null; status: "todo" | "in_progress" | "submitted" }
  | { type: "exam"; id: string; date: string | null; startTime: string | null };

/** Assignments with no announced time are due at 23:59; an Exam needs both date and time. */
export function effectiveDueInstant(item: DeadlineInput): Date | null {
  if (item.type === "assignment") return localToInstant(item.dueDate, item.dueTime ?? "23:59");
  return item.date && item.startTime ? localToInstant(item.date, item.startTime) : null;
}

export const isOverdue = (item: DeadlineInput, now: Date) =>
  item.type === "assignment" && item.status !== "submitted" && effectiveDueInstant(item)! < now;

const localDate = (item: DeadlineInput) => (item.type === "assignment" ? item.dueDate : item.date);
// Untimed Exams sort with the end of their day.
const sortKey = (item: DeadlineInput) => +(effectiveDueInstant(item) ?? localToInstant(localDate(item)!, "23:59"));
const byDue = <T extends DeadlineInput>(a: T, b: T) => sortKey(a) - sortKey(b);

/** The dashboard's sections: Overdue, the next 14 days (today and 13 more, local dates), and Exams with no date. Submitted work drops out. */
export function classifyForDashboard<T extends DeadlineInput>(items: T[], now: Date) {
  const today = todayIn(now);
  const last = addDays(today, 13);
  const open = items.filter((i) => i.type === "exam" || i.status !== "submitted");
  return {
    overdue: open.filter((i) => isOverdue(i, now)).sort(byDue),
    upcoming: open
      .filter((i) => {
        const date = localDate(i);
        const due = effectiveDueInstant(i);
        return date !== null && date >= today && date <= last && (due === null || due >= now);
      })
      .sort(byDue),
    tbaExams: open.filter((i) => i.type === "exam" && i.date === null),
  };
}
