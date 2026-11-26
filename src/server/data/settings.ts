// The Student's settings (design file 48): the switch that pauses Auto Changes (#15), and the notification settings
// (U44, #79), whose cross-field rules are checked on the merged result before anything is saved.
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { notifyProblems } from "@/server/domain/reminders";
import { AppError } from "@/server/http/errors";
import type { NotifySettings, Settings, SettingsUpdate } from "@/shared/schemas/settings";

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
  const [row] = await db.select({ autoChangesPaused: user.autoChangesPaused, ...NOTIFY }).from(user).where(eq(user.id, studentId));
  const { autoChangesPaused, ...notify } = row!;
  return { autoChangesPaused, notify };
}

export async function updateSettings(studentId: string, input: SettingsUpdate): Promise<Settings> {
  const notify = input.notify ? { ...(await getNotify(studentId)), ...input.notify } : undefined;
  if (notify) {
    const fieldErrors = notifyProblems(notify);
    const first = Object.values(fieldErrors)[0];
    if (first) throw new AppError("VALIDATION", first, { fieldErrors });
  }
  if (input.autoChangesPaused !== undefined || notify) await db.update(user).set({ ...(input.autoChangesPaused !== undefined && { autoChangesPaused: input.autoChangesPaused }), ...notify }).where(eq(user.id, studentId));
  return getSettings(studentId);
}
