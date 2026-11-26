import * as z from "zod";

// The choices the Notifications section offers (U44, #79).
export const REMINDER_HOURS = [1, 2, 4, 8, 24] as const;
export const SECOND_REMINDER_HOURS = [24, 48, 168] as const;
const hhmm = z.string({ error: "Choose a time" }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Choose a time");
const oneOf = <T extends readonly number[]>(xs: T, error: string) => z.number().refine((n) => xs.includes(n), error);

export const NotifySettings = z.object({
  digestOn: z.boolean({ error: "Choose on or off" }),
  digestTime: hhmm.refine((t) => t >= "05:00" && t <= "11:00" && (t.endsWith(":00") || t.endsWith(":30")), "Choose a time from 05:00 to 11:00"),
  digestDays: z.int({ error: "Choose 1 to 7 days" }).min(1, "Choose 1 to 7 days").max(7, "Choose 1 to 7 days"),
  reminderHours: oneOf(REMINDER_HOURS, "Choose one of the listed times"),
  secondReminderHours: oneOf(SECOND_REMINDER_HOURS, "Choose one of the listed times").nullable(),
  quietStart: hhmm.nullable(),
  quietEnd: hhmm.nullable(),
});
export type NotifySettings = z.infer<typeof NotifySettings>;

export const Settings = z.object({ autoChangesPaused: z.boolean(), notify: NotifySettings });
export type Settings = z.infer<typeof Settings>;
export const SettingsUpdate = z.strictObject({ autoChangesPaused: z.boolean({ error: "Choose on or off" }), notify: NotifySettings.strict().partial() }).partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;
