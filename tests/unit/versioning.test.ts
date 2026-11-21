import { describe, expect, it } from "vitest";
import { planFieldUpdate } from "@/server/domain/versioning";

const current = { title: "Lab 4", dueDate: "2026-11-20", dueTime: null as string | null, status: "todo" };
const setAtBefore = { title: "2026-11-01T10:00:00.000Z", dueDate: "2026-11-01T10:00:00.000Z", dueTime: "2026-11-05T10:00:00.000Z" };
const owned = ["title", "dueDate", "dueTime"] as const;

describe("planFieldUpdate (most recently sent wins, per field)", () => {
  it("writes changed fields and stamps their set time", () => {
    const plan = planFieldUpdate(current, setAtBefore, { title: "Lab 4 report", dueDate: "2026-11-20" }, "2026-11-10T00:00:00.000Z", owned);
    expect(plan).toEqual({
      noChange: false,
      fields: { title: "Lab 4 report" },
      newFieldSetAt: { ...setAtBefore, title: "2026-11-10T00:00:00.000Z" },
    });
  });

  it("reports no change when every proposed value is already current", () => {
    expect(planFieldUpdate(current, setAtBefore, { title: "Lab 4", dueTime: null }, "2026-11-10T00:00:00.000Z", owned).noChange).toBe(true);
  });

  it("drops fields the writer doesn't own", () => {
    const plan = planFieldUpdate(current, setAtBefore, { status: "submitted" }, "2026-11-10T00:00:00.000Z", owned);
    expect(plan.noChange).toBe(true);
    expect(plan.fields).toEqual({});
  });

  it("lets an older message lose to newer information field by field", () => {
    // sent 2026-11-03: newer than title and dueDate, older than dueTime
    const plan = planFieldUpdate(current, setAtBefore, { title: "Lab 4 (final)", dueDate: "2026-11-21", dueTime: "16:30" }, "2026-11-03T00:00:00.000Z", owned);
    expect(plan.fields).toEqual({ title: "Lab 4 (final)", dueDate: "2026-11-21" });
    expect(plan.newFieldSetAt.dueTime).toBe(setAtBefore.dueTime);
  });
});
