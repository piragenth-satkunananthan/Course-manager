// The Student's settings (design file 48): the switch that pauses Auto Changes (#15), and the notification settings
// (U44, #79), whose cross-field rules are checked on the merged result before anything is saved.
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { dashboardProblems, fullOrder } from "@/server/domain/dashboard-layout";
import { DEFAULT_DUE_TIME } from "@/server/domain/defaults";
import { notifyProblems } from "@/server/domain/reminders";
import { AppError } from "@/server/http/errors";
import type { DashboardSettings, NotifySettings, Settings, SettingsUpdate } from "@/shared/schemas/settings";
import { getEmailSetting } from "./email-settings";

const NOTIFY = {
  digestOn: user.digestOn,
  digestTime: user.digestTime,
  digestDays: user.digestDays,
  reminderHours: user.reminderHours,
  secondReminderHours: user.secondReminderHours,
  quietStart: user.quietStart,
  quietEnd: user.quietEnd,
};

export async function getNotify(studentId: string): Promise<NotifySettings> {
  const [row] = await db.select(NOTIFY).from(user).where(eq(user.id, studentId));
  return row!;
}

export async function getSettings(studentId: string): Promise<Settings> {
  const [[row], email] = await Promise.all([
    db.select({ autoChangesPaused: user.autoChangesPaused, alertsOff: user.alertsOff, dueSoonDays: user.dueSoonDays, layout: user.dashboardLayout, dueTime: user.defaultDueTime, weekStart: user.weekStart, timeFormat: user.timeFormat, ...NOTIFY }).from(user).where(eq(user.id, studentId)),
    getEmailSetting(studentId),
  ]);
  const { autoChangesPaused, alertsOff, dueSoonDays, layout, dueTime, weekStart, timeFormat, ...notify } = row!;
  const order = fullOrder(layout?.order);
  const dashboard: DashboardSettings = { dueSoonDays, order, hidden: order.filter((s) => layout?.hidden.includes(s)) };
  return { autoChangesPaused, notify, alertsOff: alertsOff as Settings["alertsOff"], email, dashboard, defaults: { dueTime, weekStart, timeFormat } };
}

export async function updateSettings(studentId: string, input: SettingsUpdate): Promise<Settings> {
  const notify = input.notify ? { ...(await getNotify(studentId)), ...input.notify } : undefined;
  if (notify) {
    const fieldErrors = notifyProblems(notify);
    const first = Object.values(fieldErrors)[0];
    if (first) throw new AppError("VALIDATION", first, { fieldErrors });
  }
  let dashboard: Partial<typeof user.$inferInsert> = {};
  if (input.dashboard) {
    const current = (await getSettings(studentId)).dashboard;
    const next = { ...current, ...input.dashboard };
    const fieldErrors = dashboardProblems(next);
    const first = Object.values(fieldErrors)[0];
    if (first) throw new AppError("VALIDATION", first, { fieldErrors });
    dashboard = { dueSoonDays: next.dueSoonDays, dashboardLayout: { order: next.order, hidden: next.hidden } };
  }
  const set = { ...(input.autoChangesPaused !== undefined && { autoChangesPaused: input.autoChangesPaused }), ...notify, ...(input.alertsOff && { alertsOff: [...new Set(input.alertsOff)] }), ...dashboard, ...(input.defaults && { ...(input.defaults.dueTime && { defaultDueTime: input.defaults.dueTime }), ...(input.defaults.weekStart && { weekStart: input.defaults.weekStart }), ...(input.defaults.timeFormat && { timeFormat: input.defaults.timeFormat }) }) };
  if (Object.keys(set).length) await db.update(user).set(set).where(eq(user.id, studentId));
  return getSettings(studentId);
}

/** The display and default preferences (#83). Cached per request, so a page and its layout read them once. */
export const getPrefs = cache(async (studentId: string) => {
  const [row] = await db.select({ dueTime: user.defaultDueTime, weekStart: user.weekStart, timeFormat: user.timeFormat }).from(user).where(eq(user.id, studentId));
  return row ?? { dueTime: DEFAULT_DUE_TIME, weekStart: "monday" as const, timeFormat: "24h" as const };
});
