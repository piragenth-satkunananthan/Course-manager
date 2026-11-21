import { describe, expect, it } from "vitest";
import { planFieldUpdate } from "@/server/domain/versioning";

const current = { title: "Lab 4", dueDate: "2026-11-20", dueTime: null as string | null, status: "todo" };
const setAtBefore = { title: "2026-11-01T10:00:00.000Z", dueDate: "2026-11-01T10:00:00.000Z", dueTime: "2026-11-05T10:00:00.000Z" };
const owned = ["title", "dueDate", "dueTime"] as const;
const plan = (proposed: Record<string, unknown>, setAt: string, actor: "ai" | "student" = "ai") => planFieldUpdate(current, setAtBefore, proposed, setAt, owned, actor);

describe("planFieldUpdate (most recently sent wins, per field)", () => {
  it("writes changed fields and stamps their set time", () => {
    expect(plan({ title: "Lab 4 report", dueDate: "2026-11-20" }, "2026-11-10T00:00:00.000Z")).toEqual({
      noChange: false,
      fields: { title: "Lab 4 report" },
      newFieldSetAt: { ...setAtBefore, title: "2026-11-10T00:00:00.000Z" },
    });
  });

  it("reports no change when every proposed value is already current", () => {
    expect(plan({ title: "Lab 4", dueTime: null }, "2026-11-10T00:00:00.000Z").noChange).toBe(true);
  });

  it("drops fields the writer doesn't own", () => {
    const p = plan({ status: "submitted" }, "2026-11-10T00:00:00.000Z");
    expect(p.noChange).toBe(true);
    expect(p.fields).toEqual({});
  });

  it("lets an older message lose to newer information field by field", () => {
    // sent 2026-11-03: newer than title and dueDate, older than dueTime
    const p = plan({ title: "Lab 4 (final)", dueDate: "2026-11-21", dueTime: "16:30" }, "2026-11-03T00:00:00.000Z");
    expect(p.fields).toEqual({ title: "Lab 4 (final)", dueDate: "2026-11-21" });
    expect(p.newFieldSetAt.dueTime).toBe(setAtBefore.dueTime);
  });

  it("needs a message to be strictly later: the same time doesn't overwrite", () => {
    expect(plan({ dueTime: "16:30" }, setAtBefore.dueTime).noChange).toBe(true);
  });

  it("always applies a Student edit, even against a field set by a later-dated message", () => {
    expect(plan({ dueTime: "16:30" }, "2026-11-03T00:00:00.000Z", "student").fields).toEqual({ dueTime: "16:30" });
  });
});
