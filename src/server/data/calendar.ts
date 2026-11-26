// The month view's data (design file 45a, #20): the 6 weeks (from Monday, or Sunday; #83) that show a month, with each day's
// Occurrences (Session Changes applied) and Deadlines (submitted ones too; TBA Exams have no day), by local date.
import { type WeekStart, weekStartOf } from "@/server/domain/defaults";
import { addDays } from "@/server/domain/time";
import { getPrefs } from "./settings";
import { deadlineDate } from "@/lib/deadline-date";
import type { CalendarMonth } from "@/shared/schemas/calendar";
import { listDeadlinesIn } from "./assessments";
import { getOccurrences } from "./timetable";

/** The first day of the Student's week on or before the 1st (Monday by default; #83), and the 42 days from it. */
export function monthDays(month: string, weekStart: WeekStart = "monday") {
  const first = `${month}-01`;
  const start = weekStartOf(first, weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export async function getMonth(studentId: string, month: string): Promise<CalendarMonth> {
  const days = monthDays(month, (await getPrefs(studentId)).weekStart);
  const [occurrences, deadlines] = await Promise.all([getOccurrences(studentId, days[0]!, days[41]!), listDeadlinesIn(studentId, days[0]!, days[41]!)]);
  return {
    month,
    days: days.map((date) => ({ date, occurrences: occurrences.filter((o) => o.date === date), deadlines: deadlines.filter((d) => deadlineDate(d) === date) })),
  };
}
