// Settings → Defaults (U47, #83): the due time for a new Assignment with none, and the first day of the week.
import { addDays, weekdayOf } from "./time";

import type { WeekStart } from "@/shared/schemas/settings";

export type { TimeFormat, WeekStart } from "@/shared/schemas/settings";
export const DEFAULT_DUE_TIME = "23:59"; // "time not announced": stored as no time, as before

/** A new Assignment with no time gets the Student's default; 23:59 keeps the original meaning (no time stored). */
export function withDefaultDueTime<T extends object>(proposed: T & { dueTime?: string | null }, defaultTime: string): T {
  if (proposed.dueTime || defaultTime === DEFAULT_DUE_TIME) return proposed;
  return { ...proposed, dueTime: defaultTime };
}

/** The first day of the week containing `date`. */
export const weekStartOf = (date: string, start: WeekStart) => addDays(date, -((weekdayOf(date) - (start === "monday" ? 1 : 7) + 7) % 7));
