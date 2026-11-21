import { describe, expect, it } from "vitest";
import { dayLabel, dueLine, relativeDay } from "@/lib/format";

describe("deadline wording", () => {
  it("names nearby days and dates", () => {
    expect(dayLabel("2026-11-20", "2026-11-20")).toBe("Today");
    expect(dayLabel("2026-11-21", "2026-11-20")).toBe("Tomorrow");
    expect(dayLabel("2026-11-23", "2026-11-20")).toBe("Mon 23 Nov");
    expect(relativeDay("2026-11-22", "2026-11-20")).toBe("in 2 days");
    expect(relativeDay("2026-11-18", "2026-11-20")).toBe("2 days ago");
    expect(relativeDay("2026-12-01", "2026-11-30")).toBe("tomorrow");
  });

  it("says when no time was announced instead of showing 23:59", () => {
    expect(dueLine("2026-11-19", "16:30", "2026-11-17")).toBe("Due Thu 19 Nov, 16:30 · in 2 days");
    expect(dueLine("2026-11-20", null, "2026-11-20")).toBe("Due Fri 20 Nov · time not announced · today");
  });
});
