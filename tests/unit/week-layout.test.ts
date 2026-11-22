// Seam: the week grid's layout (#19): 07:00–20:00 at 48 px per hour, overlapping classes side by side.
import { describe, expect, it } from "vitest";
import { GRID_HEIGHT, layoutDay, nowOffset } from "@/lib/week-layout";

const c = (startTime: string, endTime: string, id = startTime) => ({ id, startTime, endTime });

describe("layoutDay", () => {
  it("places a class from 07:00 at 48 px per hour", () => {
    expect(GRID_HEIGHT).toBe(13 * 48);
    expect(layoutDay([c("08:00", "10:00"), c("13:30", "14:15")])).toEqual([
      { item: c("08:00", "10:00"), top: 48, height: 96, lane: 0, lanes: 1, cutStart: false, cutEnd: false },
      { item: c("13:30", "14:15"), top: 312, height: 40, lane: 0, lanes: 1, cutStart: false, cutEnd: false }, // 45 minutes is 36 px: raised to 40
    ]);
  });

  it("clips classes outside 07:00–20:00 and marks the cut; every block is at least 40 px, and boxes never cover each other", () => {
    expect(layoutDay([c("06:00", "08:00"), c("19:30", "21:00"), c("05:00", "06:00")])).toEqual([
      { item: c("06:00", "08:00"), top: 0, height: 48, lane: 0, lanes: 2, cutStart: true, cutEnd: false },
      { item: c("05:00", "06:00"), top: 0, height: 40, lane: 1, lanes: 2, cutStart: true, cutEnd: false }, // all before 07:00: at the top, beside the other
      { item: c("19:30", "21:00"), top: GRID_HEIGHT - 40, height: 40, lane: 0, lanes: 1, cutStart: false, cutEnd: true },
    ]);
    // A 15-minute class drawn 40 px tall reaches into the next class's box: they go side by side.
    expect(layoutDay([c("13:00", "13:15", "short"), c("13:15", "14:00", "next")]).map((b) => [b.item.id, b.height, b.lane, b.lanes])).toEqual([
      ["short", 40, 0, 2],
      ["next", 40, 1, 2],
    ]);
  });

  it("puts overlapping classes side by side, each group with its own lane count", () => {
    const out = layoutDay([c("08:00", "10:00", "a"), c("09:00", "11:00", "b"), c("10:00", "12:00", "c"), c("14:00", "15:00", "d")]);
    expect(out.map((b) => [b.item.id, b.lane, b.lanes])).toEqual([
      ["a", 0, 2],
      ["b", 1, 2],
      ["c", 0, 2], // starts when a ends: reuses lane 0
      ["d", 0, 1],
    ]);
  });
});

describe("nowOffset", () => {
  it("is the current time's position, or null outside the grid", () => {
    expect(nowOffset("07:00")).toBe(0);
    expect(nowOffset("12:30")).toBe(264);
    expect(nowOffset("06:59")).toBeNull();
    expect(nowOffset("20:01")).toBeNull();
  });
});
