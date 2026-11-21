// Auto Change rules (design §3): the Undo rule, risk, and how titles are matched.
import { addDays } from "./time";

/** Titles match ignoring case, punctuation and spacing ("Lab 4 report" = "lab-4  Report"). */
export const titleKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Undo is allowed only if the change isn't undone and nothing has changed the item since: its current version is
 * still the change's after_version. `laterActor` is who made the next version, to explain a blocked Undo.
 */
export function canUndo(change: { undoneAt: Date | null; afterVersion: number }, currentVersion: number, laterActor: "student" | "ai" | "system" | null) {
  if (change.undoneAt) return { ok: false as const, reason: "Already undone" };
  if (currentVersion !== change.afterVersion)
    return { ok: false as const, reason: laterActor === "student" ? "You edited this after the change" : "A later message changed this" };
  return { ok: true as const };
}

/** Moving a Deadline later or cancelling something is risky: highlighted for 7 days (U3) and listed in "Check these". */
export function riskOf(op: "create" | "update" | "delete", before: { date: string | null; time: string | null } | null, after: { date: string | null; time: string | null } | null) {
  if (op === "delete") return "cancelled" as const;
  if (op === "update" && before?.date && after?.date) {
    const instant = (d: { date: string | null; time: string | null }) => `${d.date} ${d.time ?? "23:59"}`;
    if (instant(after) > instant(before)) return "moved_later" as const;
  }
  return "normal" as const;
}

export const HIGHLIGHT_DAYS = 7;
export const highlightCutoff = (today: string) => addDays(today, -HIGHLIGHT_DAYS);
