import { describe, expect, it } from "vitest";
import { formatTime } from "@/lib/format";
import { weekStartOf, withDefaultDueTime } from "@/server/domain/defaults";

describe("default due time (#83, U47)", () => {
  it("fills a new Assignment with no time from the Student's default", () => {
    expect(withDefaultDueTime({ title: "Lab", dueDate: "2026-12-01" }, "17:00")).toEqual({ title: "Lab", dueDate: "2026-12-01", dueTime: "17:00" });
    expect(withDefaultDueTime({ title: "Lab", dueDate: "2026-12-01", dueTime: null }, "17:00")).toMatchObject({ dueTime: "17:00" });
  });
  it("keeps an announced time, and leaves the time out when the default is 23:59 (time not announced, as today)", () => {
    expect(withDefaultDueTime({ dueDate: "2026-12-01", dueTime: "09:00" }, "17:00")).toMatchObject({ dueTime: "09:00" });
    expect(withDefaultDueTime({ dueDate: "2026-12-01" }, "23:59")).toEqual({ dueDate: "2026-12-01" });
  });
});

describe("the week's first day (#83)", () => {
  it("is the Monday or the Sunday on or before the date", () => {
    expect(weekStartOf("2026-11-26", "monday")).toBe("2026-11-23"); // Thu → Mon
    expect(weekStartOf("2026-11-23", "monday")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-29", "monday")).toBe("2026-11-23"); // Sun belongs to the week before
    expect(weekStartOf("2026-11-26", "sunday")).toBe("2026-11-22");
    expect(weekStartOf("2026-11-29", "sunday")).toBe("2026-11-29");
  });
});

describe("time format (#83)", () => {
  it("shows 24-hour by default and 12-hour when chosen", () => {
    expect(formatTime("14:05")).toBe("14:05");
    expect(["00:00", "09:30", "12:00", "14:05", "23:59"].map((t) => formatTime(t, "12h"))).toEqual(["12:00 am", "9:30 am", "12:00 pm", "2:05 pm", "11:59 pm"]);
  });
});
