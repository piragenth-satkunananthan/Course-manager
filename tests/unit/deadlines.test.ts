import { describe, expect, it } from "vitest";
import { classifyForDashboard, effectiveDueInstant, isOverdue, type DeadlineInput } from "@/server/domain/deadlines";

const a = (id: string, dueDate: string, dueTime: string | null = null, status: "todo" | "in_progress" | "submitted" = "todo"): DeadlineInput => ({
  type: "assignment", id, dueDate, dueTime, status,
});
const e = (id: string, date: string | null, startTime: string | null = null): DeadlineInput => ({ type: "exam", id, date, startTime });

// Fri 20 Nov 2026, 10:00 in Colombo
const NOW = new Date("2026-11-20T04:30:00Z");

describe("effectiveDueInstant", () => {
  it("treats an Assignment with no announced time as due at 23:59 Colombo", () => {
    expect(effectiveDueInstant(a("1", "2026-11-20"))?.toISOString()).toBe("2026-11-20T18:29:00.000Z");
    expect(effectiveDueInstant(a("1", "2026-11-20", "16:30"))?.toISOString()).toBe("2026-11-20T11:00:00.000Z");
  });

  it("gives an Exam an instant only when both date and time are known", () => {
    expect(effectiveDueInstant(e("1", "2026-11-25", "09:00"))?.toISOString()).toBe("2026-11-25T03:30:00.000Z");
    expect(effectiveDueInstant(e("1", "2026-11-25"))).toBeNull();
    expect(effectiveDueInstant(e("1", null))).toBeNull();
  });
});

describe("isOverdue", () => {
  it("is true for an unsubmitted Assignment past its due instant, never for a submitted one or an Exam", () => {
    expect(isOverdue(a("1", "2026-11-20", "09:59"), NOW)).toBe(true);
    expect(isOverdue(a("1", "2026-11-20"), NOW)).toBe(false); // due 23:59 today
    expect(isOverdue(a("1", "2026-11-19", null, "submitted"), NOW)).toBe(false);
    expect(isOverdue(e("1", "2026-11-19", "09:00"), NOW)).toBe(false);
  });
});

describe("classifyForDashboard", () => {
  it("puts Overdue first, then the next 14 days by due time, and TBA Exams apart", () => {
    const items = [
      a("later-today", "2026-11-20", "18:00"),
      a("overdue-old", "2026-11-10"),
      a("overdue-new", "2026-11-19", "16:30"),
      a("day-14", "2026-12-04"),
      a("day-15", "2026-12-05"),
      a("submitted", "2026-11-22", null, "submitted"),
      e("exam-untimed-today", "2026-11-20"),
      e("exam-past", "2026-11-18", "09:00"),
      e("exam-tba", null),
      a("earlier-today", "2026-11-20", "12:00"),
    ];
    const c = classifyForDashboard(items, NOW);
    expect(c.overdue.map((i) => i.id)).toEqual(["overdue-old", "overdue-new"]);
    expect(c.upcoming.map((i) => i.id)).toEqual(["earlier-today", "later-today", "exam-untimed-today", "day-14"]);
    expect(c.tbaExams.map((i) => i.id)).toEqual(["exam-tba"]);
  });
});
