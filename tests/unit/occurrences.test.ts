import { describe, expect, it } from "vitest";
import { expandOccurrences, isHappeningNow, type ChangeInput, type SessionInput } from "@/server/domain/occurrences";

// Semester Mon 2 Nov – Fri 27 Nov 2026. Thursday lecture 10:00–12:00, Monday lab 14:00–16:00.
const sem = { semesterStart: "2026-11-02", semesterEnd: "2026-11-27" };
const lecture: SessionInput = { id: "lec", courseId: "c1", kind: "lecture", weekday: 4, startTime: "10:00", endTime: "12:00", location: "B2", ...sem };
const lab: SessionInput = { id: "lab", courseId: "c1", kind: "lab", weekday: 1, startTime: "14:00", endTime: "16:00", location: "L3", ...sem };
const change = (c: Partial<ChangeInput> & Pick<ChangeInput, "id" | "kind">): ChangeInput => ({
  version: 1, courseId: "c1", classSessionId: "lec", sessionKind: null, originalDate: null, newDate: null, newStartTime: null, newEndTime: null, newLocation: null, ...c,
});
const brief = (o: ReturnType<typeof expandOccurrences>[number]) => `${o.date} ${o.startTime} ${o.classSessionId ?? "extra"} ${o.status}`;

describe("expandOccurrences", () => {
  it("repeats each weekly Class Session on its weekday, only between the Semester's dates", () => {
    const occ = expandOccurrences([lecture, lab], [], { from: "2026-10-26", to: "2026-11-08" });
    expect(occ.map(brief)).toEqual(["2026-11-02 14:00 lab normal", "2026-11-05 10:00 lec normal"]);
  });

  it("applies a cancel on the original day, a reschedule on its new day and time, and an extra session", () => {
    const changes = [
      change({ id: "x1", kind: "cancel", originalDate: "2026-11-12" }),
      change({ id: "x2", kind: "reschedule", originalDate: "2026-11-19", newDate: "2026-11-20", newStartTime: "15:00", newEndTime: "17:00" }),
      change({ id: "x3", kind: "extra", classSessionId: null, sessionKind: "tutorial", newDate: "2026-11-18", newStartTime: "08:00", newEndTime: "09:00", newLocation: "T1" }),
    ];
    const occ = expandOccurrences([lecture], changes, { from: "2026-11-12", to: "2026-11-21" });
    expect(occ.map(brief)).toEqual(["2026-11-12 10:00 lec cancelled", "2026-11-18 08:00 extra extra", "2026-11-20 15:00 lec rescheduled"]);
    const moved = occ.find((o) => o.status === "rescheduled")!;
    expect(moved).toMatchObject({ originalDate: "2026-11-19", originalStartTime: "10:00", location: "B2", sessionChangeId: "x2", sessionChangeVersion: 1 });
    expect(occ.find((o) => o.status === "extra")).toMatchObject({ kind: "tutorial", location: "T1", classSessionId: null });
  });

  it("shows a class moved into the range even when its original day is outside it", () => {
    const changes = [change({ id: "x", kind: "reschedule", originalDate: "2026-11-05", newDate: "2026-11-09", newStartTime: "10:00", newEndTime: "12:00", newLocation: "Hall A" })];
    expect(expandOccurrences([lecture], changes, { from: "2026-11-09", to: "2026-11-09" }).map(brief)).toEqual(["2026-11-09 10:00 lec rescheduled"]);
    expect(expandOccurrences([lecture], changes, { from: "2026-11-05", to: "2026-11-05" })).toEqual([]);
  });
});

describe("isHappeningNow", () => {
  const occ = expandOccurrences([lecture], [], { from: "2026-11-05", to: "2026-11-05" })[0]!;
  it("is true between start and end in Colombo", () => {
    expect(isHappeningNow(occ, new Date("2026-11-05T04:30:00Z"))).toBe(true); // 10:00
    expect(isHappeningNow(occ, new Date("2026-11-05T06:30:00Z"))).toBe(false); // 12:00, ended
    expect(isHappeningNow({ ...occ, status: "cancelled" }, new Date("2026-11-05T05:00:00Z"))).toBe(false);
  });
});
