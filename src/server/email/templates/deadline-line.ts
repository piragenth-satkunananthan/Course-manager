import { formatDate, formatTime } from "@/lib/format";
import type { Deadline } from "@/shared/schemas/dashboard";

/** "CS2010 · Lab 4 report · Fri 20 Nov, 16:30" (or "time not announced"), shared by both emails. */
/** `tf`: the Student's time format (#83). */
export function deadlineLine(d: Deadline, tf: "24h" | "12h" = "24h") {
  const kind = d.type === "assignment" ? "Assignment" : "Exam";
  const date = d.type === "assignment" ? d.item.dueDate : d.item.date!;
  const at = d.type === "assignment" ? d.item.dueTime : d.item.startTime;
  const time = at ? formatTime(at, tf) : d.type === "assignment" ? "time not announced" : "time TBA";
  return { kind, text: `${d.item.courseCode} · ${d.item.title} · ${formatDate(date)}, ${time}` };
}
