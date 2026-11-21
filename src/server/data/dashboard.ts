// The dashboard (design file 44). Auto Changes join with #12.
import { classifyForDashboard, type DeadlineInput } from "@/server/domain/deadlines";
import { addDays, todayIn } from "@/server/domain/time";
import type { Dashboard, Deadline } from "@/shared/schemas/dashboard";
import type { Exam } from "@/shared/schemas/exam";
import { loadOpenDeadlines } from "./assessments";
import { getBanners } from "./health";
import { getOccurrences } from "./timetable";

type Item = DeadlineInput & { deadline: Deadline };

export async function getDashboard(studentId: string, now = new Date()): Promise<Dashboard> {
  const today = todayIn(now);
  // Exams dated before yesterday can't be upcoming.
  const [open, todaySessions, banners] = await Promise.all([
    loadOpenDeadlines(studentId, { examsFrom: addDays(today, -1), includeTba: true }),
    getOccurrences(studentId, today, today),
    getBanners(now),
  ]);
  const items: Item[] = open.map(({ deadline: d }): Item =>
    d.type === "assignment"
      ? { type: "assignment", id: d.item.id, dueDate: d.item.dueDate, dueTime: d.item.dueTime, status: d.item.status, deadline: d }
      : { type: "exam", id: d.item.id, date: d.item.date, startTime: d.item.startTime, deadline: d },
  );
  const c = classifyForDashboard(items, now);
  return {
    overdue: c.overdue.map((i) => i.deadline),
    todaySessions,
    upcoming: c.upcoming.map((i) => i.deadline),
    tbaExams: c.tbaExams.map((i) => i.deadline.item as Exam),
    highlightedChanges: [],
    recentAutoChanges: [],
    banners,
  };
}
