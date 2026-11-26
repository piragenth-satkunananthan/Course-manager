import { describe, expect, it } from "vitest";
import { DASHBOARD_SECTIONS, dashboardProblems, dashboardSections } from "@/server/domain/dashboard-layout";
import { classifyForDashboard } from "@/server/domain/deadlines";

describe("the dashboard's sections (#84, U47)", () => {
  it("are in today's order, all shown, by default", () => {
    expect(dashboardSections(null)).toEqual(["overdue", "today", "dueSoon", "tbaExams", "checkThese", "recent"]);
  });

  it("follow the saved order and leave out hidden ones; new or missing ones come at the end", () => {
    expect(dashboardSections({ order: ["dueSoon", "overdue", "recent"], hidden: ["tbaExams"] })).toEqual(["dueSoon", "overdue", "recent", "today", "checkThese"]);
  });

  it("never hide Overdue, even if a saved layout says so", () => {
    expect(dashboardSections({ order: [], hidden: ["overdue", "recent"] })).toContain("overdue");
    expect(dashboardProblems({ order: [...DASHBOARD_SECTIONS], hidden: ["overdue"] })).toEqual({ hidden: "Overdue can't be hidden" });
    expect(dashboardProblems({ order: ["today", "today"], hidden: [] })).toEqual({ order: "Each section can appear only once" });
  });
});

describe("Due soon's range (#84)", () => {
  const now = new Date("2026-11-20T04:30:00Z"); // Fri 20 Nov, 10:00 Colombo
  const a = (id: string, dueDate: string) => ({ type: "assignment" as const, id, dueDate, dueTime: "12:00", status: "todo" as const });
  it("covers today and the chosen number of days (14 by default)", () => {
    const items = [a("in-4", "2026-11-24"), a("in-6", "2026-11-26"), a("in-13", "2026-12-03"), a("in-14", "2026-12-04")];
    expect(classifyForDashboard(items, now).upcoming.map((i) => i.id)).toEqual(["in-4", "in-6", "in-13"]);
    expect(classifyForDashboard(items, now, 5).upcoming.map((i) => i.id)).toEqual(["in-4"]);
  });
});
