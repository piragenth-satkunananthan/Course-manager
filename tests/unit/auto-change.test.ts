import { describe, expect, it } from "vitest";
import { canUndo, riskOf, titleKey } from "@/server/domain/auto-change";

describe("the Undo rule", () => {
  const change = { undoneAt: null, afterVersion: 3 };
  it("allows Undo while nothing has changed the item since", () => {
    expect(canUndo(change, 3, null)).toEqual({ ok: true });
  });
  it("blocks it after the Student's edit or a later message, saying which", () => {
    expect(canUndo(change, 4, "student")).toEqual({ ok: false, reason: "You edited this after the change" });
    expect(canUndo(change, 4, "ai")).toEqual({ ok: false, reason: "A later message changed this" });
  });
  it("blocks a second Undo", () => {
    expect(canUndo({ undoneAt: new Date(), afterVersion: 3 }, 3, null)).toEqual({ ok: false, reason: "Already undone" });
  });
});

describe("risk", () => {
  it("flags cancellations and Deadlines moved later, nothing else", () => {
    expect(riskOf("delete", null, null)).toBe("cancelled");
    expect(riskOf("update", { date: "2026-11-20", time: null }, { date: "2026-11-21", time: "09:00" })).toBe("moved_later");
    expect(riskOf("update", { date: "2026-11-20", time: "16:30" }, { date: "2026-11-20", time: "18:00" })).toBe("moved_later");
    expect(riskOf("update", { date: "2026-11-20", time: null }, { date: "2026-11-20", time: "16:30" })).toBe("normal"); // 23:59 → 16:30 is earlier
    expect(riskOf("create", null, { date: "2026-11-20", time: null })).toBe("normal");
  });
});

describe("titleKey", () => {
  it("ignores case, punctuation and spacing", () => {
    expect(titleKey("  Lab-4  Report! ")).toBe(titleKey("lab 4 report"));
  });
});
