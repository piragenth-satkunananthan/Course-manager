import { describe, expect, it } from "vitest";
import { addDays, instantToLocal, localToInstant, todayIn } from "@/server/domain/time";

describe("time in Asia/Colombo (UTC+05:30, no daylight saving)", () => {
  it("turns a local date and time into an instant", () => {
    expect(localToInstant("2026-11-20", "23:59").toISOString()).toBe("2026-11-20T18:29:00.000Z");
    expect(localToInstant("2026-11-20", "00:00").toISOString()).toBe("2026-11-19T18:30:00.000Z");
  });

  it("turns an instant into a local date and time", () => {
    expect(instantToLocal(new Date("2026-11-20T18:31:00Z"))).toEqual({ date: "2026-11-21", time: "00:01" });
  });

  it("knows the local day, which starts at 18:30 UTC", () => {
    expect(todayIn(new Date("2026-11-20T18:29:59Z"))).toBe("2026-11-20");
    expect(todayIn(new Date("2026-11-20T18:30:00Z"))).toBe("2026-11-21");
  });

  it("adds days to a local date across months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
  });
});
