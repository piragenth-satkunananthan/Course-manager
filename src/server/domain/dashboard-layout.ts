// The dashboard's sections, in the Student's order (U47, #84). Overdue can be moved but never hidden: it's how a
// missed deadline shows.
export const DASHBOARD_SECTIONS = ["overdue", "today", "dueSoon", "tbaExams", "checkThese", "recent"] as const;
export type DashboardSection = (typeof DASHBOARD_SECTIONS)[number];
export type DashboardLayout = { order: string[]; hidden: string[] };

/** The sections to show, in order. Unknown ids are ignored; sections a saved layout doesn't list come at the end. */
export function dashboardSections(saved: DashboardLayout | null): DashboardSection[] {
  const known = (id: string): id is DashboardSection => (DASHBOARD_SECTIONS as readonly string[]).includes(id);
  const order = [...new Set([...(saved?.order ?? []).filter(known), ...DASHBOARD_SECTIONS])];
  const hidden = new Set((saved?.hidden ?? []).filter((h) => h !== "overdue"));
  return order.filter((s) => !hidden.has(s));
}

export function dashboardProblems(l: DashboardLayout): Partial<Record<keyof DashboardLayout, string>> {
  if (l.hidden.includes("overdue")) return { hidden: "Overdue can't be hidden" };
  if (new Set(l.order).size !== l.order.length) return { order: "Each section can appear only once" };
  return {};
}
