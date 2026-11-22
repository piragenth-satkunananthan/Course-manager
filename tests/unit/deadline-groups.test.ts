// Seam: the Deadlines list's groups (#21). This week runs from today until Sunday (product owner, 2026-11-22).
import { describe, expect, it } from "vitest";
import { groupDeadlines } from "@/lib/deadline-groups";
import type { Deadline } from "@/shared/schemas/dashboard";

const NOW = new Date("2026-11-19T04:30:00Z"); // Thu 19 Nov, 10:00 Colombo
const TODAY = "2026-11-19";
const a = (id: string, dueDate: string, dueAt: string, status = "todo") => ({ type: "assignment", item: { id, dueDate, dueAt, status } }) as unknown as Deadline;
const e = (id: string, date: string | null) => ({ type: "exam", item: { id, date, dueAt: date ? `${date}T03:30:00.000Z` : null } }) as unknown as Deadline;
const ids = (ds: Deadline[]) => ds.map((d) => d.item.id);

describe("groupDeadlines", () => {
  it("puts open past Assignments in Overdue, today to Sunday in This week, after Sunday in Later", () => {
    const g = groupDeadlines(
      [
        a("later", "2026-11-23", "2026-11-23T18:29:00Z"),
        a("sunday", "2026-11-22", "2026-11-22T18:29:00Z"),
        a("this-morning", "2026-11-19", "2026-11-19T03:00:00Z"), // 08:30 today: already past
        a("tonight", "2026-11-19", "2026-11-19T18:29:00Z"),
        a("last-week", "2026-11-12", "2026-11-12T18:29:00Z"),
      ],
      NOW,
      TODAY,
    );
    expect(ids(g.overdue)).toEqual(["last-week", "this-morning"]); // oldest first
    expect(ids(g.thisWeek)).toEqual(["tonight", "sunday"]);
    expect(ids(g.later)).toEqual(["later"]);
    expect(g.earlier).toEqual([]);
  });

  it("puts submitted past Assignments and held Exams in Earlier (newest first), and dateless Exams in Date TBA", () => {
    const g = groupDeadlines(
      [a("done-old", "2026-11-05", "2026-11-05T18:29:00Z", "submitted"), a("done", "2026-11-12", "2026-11-12T18:29:00Z", "submitted"), a("done-soon", "2026-11-20", "2026-11-20T18:29:00Z", "submitted"), e("held", "2026-11-18"), e("tba", null), e("quiz", "2026-11-21")],
      NOW,
      TODAY,
    );
    expect(ids(g.earlier)).toEqual(["held", "done", "done-old"]);
    expect(ids(g.thisWeek)).toEqual(["done-soon", "quiz"]);
    expect(ids(g.tba)).toEqual(["tba"]);
    expect(g.overdue).toEqual([]);
  });

  it("sorts an untimed Exam at 23:59 Colombo of its day, against timed ones by instant", () => {
    const untimed = { type: "exam", item: { id: "untimed", date: "2026-11-20", dueAt: null } } as unknown as Deadline;
    const early = { type: "exam", item: { id: "next-morning", date: "2026-11-21", dueAt: "2026-11-20T21:30:00.000Z" } } as unknown as Deadline; // 03:00 on the 21st
    expect(ids(groupDeadlines([early, untimed], NOW, TODAY).thisWeek)).toEqual(["untimed", "next-morning"]);
  });
});
