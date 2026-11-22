// The Student's settings (design file 48): for now, the switch that pauses Auto Changes (#15). While paused, messages
// keep queuing and the AI isn't called; resuming processes the queue.
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import type { Settings, SettingsUpdate } from "@/shared/schemas/settings";

export async function getSettings(studentId: string): Promise<Settings> {
  const [row] = await db.select({ autoChangesPaused: user.autoChangesPaused }).from(user).where(eq(user.id, studentId));
  return { autoChangesPaused: !!row?.autoChangesPaused };
}

export async function updateSettings(studentId: string, input: SettingsUpdate): Promise<Settings> {
  if (input.autoChangesPaused !== undefined) await db.update(user).set({ autoChangesPaused: input.autoChangesPaused }).where(eq(user.id, studentId));
  return getSettings(studentId);
}
