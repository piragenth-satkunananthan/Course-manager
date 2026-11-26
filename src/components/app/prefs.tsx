"use client";
// The Student's display preferences (Settings → Defaults, #83), set once in the app layout and read by any component.
import { createContext, useContext } from "react";
import { formatTime } from "@/lib/format";
import type { TimeFormat, WeekStart } from "@/server/domain/defaults";

type Prefs = { timeFormat: TimeFormat; weekStart: WeekStart };
const PrefsContext = createContext<Prefs>({ timeFormat: "24h", weekStart: "monday" });

export function PrefsProvider({ prefs, children }: { prefs: Prefs; children: React.ReactNode }) {
  return <PrefsContext.Provider value={prefs}>{children}</PrefsContext.Provider>;
}

/** The preferences, plus `t`, which shows an "HH:mm" time in the chosen format. */
export function usePrefs() {
  const p = useContext(PrefsContext);
  return { ...p, t: (hhmm: string) => formatTime(hhmm, p.timeFormat) };
}
