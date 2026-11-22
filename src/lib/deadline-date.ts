import type { Deadline } from "@/shared/schemas/dashboard";

/** The local date a Deadline falls on (an Exam's may be TBA). Usable on server and client. */
export const deadlineDate = (d: Deadline) => (d.type === "assignment" ? d.item.dueDate : d.item.date);

/** An Assignment not submitted whose due instant (dueAt: the server's, 23:59 when untimed) has passed; null now means not yet known. */
export const isOverdueDeadline = (d: Deadline, now: Date | null) =>
  d.type === "assignment" && d.item.status !== "submitted" && !!now && !!d.item.dueAt && new Date(d.item.dueAt) < now;

/** The month view's link, with a day's sheet open when `day` is given (design-system §6.9). */
export const calendarHref = (month: string, day?: string) => `/calendar?month=${month}${day ? `&day=${day}` : ""}`;
