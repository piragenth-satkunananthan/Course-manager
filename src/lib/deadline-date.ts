import type { Deadline } from "@/shared/schemas/dashboard";

/** The local date a Deadline falls on (an Exam's may be TBA). Usable on server and client. */
export const deadlineDate = (d: Deadline) => (d.type === "assignment" ? d.item.dueDate : d.item.date);
