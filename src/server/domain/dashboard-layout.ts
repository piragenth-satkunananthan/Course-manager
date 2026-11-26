// The dashboard's sections, in the Student's order (U47, #84). Overdue can be moved but never hidden: it's how a
// missed deadline shows.
import { DASHBOARD_SECTION_IDS } from "@/shared/schemas/settings";

export const DASHBOARD_SECTIONS = DASHBOARD_SECTION_IDS;
export const DEFAULT_DUE_SOON_DAYS = 14;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];
export type DashboardLayout = { order: string[]; hidden: string[] };

/** A saved order made whole: unknown ids dropped, sections it doesn't list added at the end. */
export function fullOrder(order: readonly string[] | undefined): DashboardSection[] {
  const known = (id: string): id is DashboardSection => (DASHBOARD_SECTIONS as readonly string[]).includes(id);
  return [...new Set([...(order ?? []).filter(known), ...DASHBOARD_SECTIONS])];
}

/** The sections to show, in order. Unknown ids are ignored; sections a saved layout doesn't list come at the end. */
export function dashboardSections(saved: DashboardLayout | null): DashboardSection[] {
  const order = fullOrder(saved?.order);
  const hidden = new Set((saved?.hidden ?? []).filter((h) => h !== "overdue"));
  return order.filter((s) => !hidden.has(s));
}

export function dashboardProblems(l: DashboardLayout): Partial<Record<keyof DashboardLayout, string>> {
  if (l.hidden.includes("overdue")) return { hidden: "Overdue can't be hidden" };
  if (new Set(l.order).size !== l.order.length) return { order: "Each section can appear only once" };
  return {};
}
