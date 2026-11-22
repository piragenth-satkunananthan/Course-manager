// Display formats (design-system §2.2): "Fri 20 Nov", 24-hour times. Local dates are plain YYYY-MM-DD values,
// so they're formatted in UTC to keep the day unchanged.
export function formatDate(isoDate: string, { weekday = true, year = false } = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...(weekday ? { weekday: "short" } : {}),
    ...(year ? { year: "numeric" } : {}),
  })
    .format(new Date(`${isoDate}T00:00:00Z`))
    .replace(",", "");
}

const MS_DAY = 86_400_000;
const dayDiff = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / MS_DAY);

/** "Today", "Tomorrow", or "Mon 23 Nov": sticky day headers (design-system §5). */
export function dayLabel(date: string, today: string) {
  const d = dayDiff(today, date);
  return d === 0 ? "Today" : d === 1 ? "Tomorrow" : formatDate(date);
}

/** "today", "tomorrow", "in 3 days", "2 days ago", from local dates. */
export function relativeDay(date: string, today: string) {
  const d = dayDiff(today, date);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
}

/** "Due Thu 19 Nov, 16:30 · in 2 days" or "Due Fri 20 Nov · time not announced" (design-system §6.1). */
export function dueLine(date: string, time: string | null, today: string, verb = "Due", untimed = "time not announced") {
  return `${verb} ${formatDate(date)}${time ? `, ${time}` : ` · ${untimed}`} · ${relativeDay(date, today)}`;
}

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const; // ISO 1–7
export const SESSION_KIND_LABEL = { lecture: "Lecture", tutorial: "Tutorial", lab: "Lab" } as const;

/** "1 class", "2 classes": `many` when the plural isn't just an added "s". */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "November 2026" for a YYYY-MM month (the month view's title). */
export const formatMonth = (month: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));
