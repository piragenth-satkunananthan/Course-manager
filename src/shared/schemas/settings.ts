import * as z from "zod";

export const Settings = z.object({ autoChangesPaused: z.boolean() });
export type Settings = z.infer<typeof Settings>;
export const SettingsUpdate = z.strictObject({ autoChangesPaused: z.boolean({ error: "Choose on or off" }) }).partial();
export type SettingsUpdate = z.infer<typeof SettingsUpdate>;
