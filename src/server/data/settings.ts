// The Student's settings (design file 48): the switch that pauses Auto Changes (#15), and the notification settings
// (U44, #79), whose cross-field rules are checked on the merged result before anything is saved.
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { DASHBOARD_SECTIONS, dashboardProblems } from "@/server/domain/dashboard-layout";
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
    db.select({ autoChangesPaused: user.autoChangesPaused, alertsOff: user.alertsOff, dueSoonDays: user.dueSoonDays, layout: user.dashboardLayout, ...NOTIFY }).from(user).where(eq(user.id, studentId)),
    getEmailSetting(studentId),
  ]);
  const { autoChangesPaused, alertsOff, dueSoonDays, layout, ...notify } = row!;
  const dashboard = { dueSoonDays, order: (layout?.order ?? [...DASHBOARD_SECTIONS]) as DashboardSettings["order"], hidden: (layout?.hidden ?? []) as DashboardSettings["hidden"] };
  return { autoChangesPaused, notify, alertsOff: alertsOff as Settings["alertsOff"], email, dashboard };
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
  const set = { ...(input.autoChangesPaused !== undefined && { autoChangesPaused: input.autoChangesPaused }), ...notify, ...(input.alertsOff && { alertsOff: [...new Set(input.alertsOff)] }), ...dashboard };
  if (Object.keys(set).length) await db.update(user).set(set).where(eq(user.id, studentId));
  return getSettings(studentId);
}
