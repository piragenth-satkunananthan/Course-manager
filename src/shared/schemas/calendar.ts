import * as z from "zod";
import { IsoDate } from "./common";
import { Deadline } from "./dashboard";
import { Occurrence } from "./timetable";

export const Month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use the format YYYY-MM");
export const CalendarQuery = z.strictObject({ month: Month });

/** The month view (design §7): every day of the 6 displayed weeks, the months either side included. */
export const CalendarMonth = z.object({
  month: Month,
  days: z.array(z.object({ date: IsoDate, occurrences: z.array(Occurrence), deadlines: z.array(Deadline) })),
});
export type CalendarMonth = z.infer<typeof CalendarMonth>;
