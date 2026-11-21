import { formatDate } from "@/lib/format";
import type { Deadline } from "@/shared/schemas/dashboard";

/** "CS2010 · Lab 4 report · Fri 20 Nov, 16:30" (or "time not announced"), shared by both emails. */
export function deadlineLine(d: Deadline) {
  const kind = d.type === "assignment" ? "Assignment" : "Exam";
  const date = d.type === "assignment" ? d.item.dueDate : d.item.date!;
  const time = d.type === "assignment" ? (d.item.dueTime ?? "time not announced") : (d.item.startTime ?? "time TBA");
  return { kind, text: `${d.item.courseCode} · ${d.item.title} · ${formatDate(date)}, ${time}` };
}
