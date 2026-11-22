import { describe, expect, it } from "vitest";
import { isDigestWindow, selectDigest } from "@/server/domain/digest";
import { dueForFinalReminder } from "@/server/domain/reminders";

const NOW = new Date("2026-11-20T04:30:00Z"); // Fri 20 Nov, 10:00 Colombo
const NOTHING = { riskyChanges: [], possiblyMissed: [], unknownCourses: [], paused: false };
const d = (id: string, dueAt: string | null, localDate = "2026-11-20") => ({ id, dueAt: dueAt ? new Date(dueAt) : null, localDate });

describe("dueForFinalReminder", () => {
  it("picks open Deadlines due in the next 4 hours, never past ones or ones with no time", () => {
    const picked = dueForFinalReminder(
      [d("past", "2026-11-20T04:29:00Z"), d("in-1h", "2026-11-20T05:30:00Z"), d("in-4h", "2026-11-20T08:30:00Z"), d("in-4h1m", "2026-11-20T08:31:00Z"), d("no-time", null)],
      NOW,
    );
    expect(picked.map((x) => x.id)).toEqual(["in-1h", "in-4h"]);
  });
});

describe("isDigestWindow", () => {
  it("is open from 07:00 to 08:59 Colombo", () => {
    expect(isDigestWindow(new Date("2026-11-20T01:29:00Z"))).toBe(false); // 06:59
    expect(isDigestWindow(new Date("2026-11-20T01:30:00Z"))).toBe(true); // 07:00
    expect(isDigestWindow(new Date("2026-11-20T03:29:00Z"))).toBe(true); // 08:59
    expect(isDigestWindow(new Date("2026-11-20T03:30:00Z"))).toBe(false); // 09:00
  });
});

describe("selectDigest", () => {
  it("lists today, tomorrow and the day after, plus what was added or moved; nothing to say is null", () => {
    const open = [d("today", null, "2026-11-20"), d("day-after", null, "2026-11-22"), d("later", null, "2026-11-25")];
    expect(selectDigest(open, new Set(["later"]), "2026-11-20", NOTHING)).toEqual({
      dueSoon: [open[0], open[1]],
      addedOrMoved: [open[2]],
      checkThese: [],
    });
    expect(selectDigest([d("later", null, "2026-11-25")], new Set(), "2026-11-20", NOTHING)).toBeNull();
  });

  it("lists Check these (#14): cancellations, Deadlines moved later, Possibly Missed messages, open Unknown Courses and paused Auto Changes", () => {
    const sections = selectDigest([], new Set(), "2026-11-20", {
      riskyChanges: [{ summary: "Quiz 2 cancelled", risk: "cancelled" }, { summary: "Lab 4 report: Fri 27 Nov → Mon 30 Nov", risk: "moved_later" }],
      possiblyMissed: [{ senderName: "Kasun", groupSubject: "CS2010 group", text: `Group B lab cancelled ${"x".repeat(200)}` }, { senderName: null, groupSubject: "Class", text: null }],
      unknownCourses: [{ name: "ENG" }],
      paused: true,
    });
    expect(sections?.checkThese).toEqual([
      "Cancelled: Quiz 2 cancelled",
      "Moved later: Lab 4 report: Fri 27 Nov → Mon 30 Nov",
      `Possibly missed, Kasun in CS2010 group: "Group B lab cancelled ${"x".repeat(97)}…"`,
      "Possibly missed, a message in Class",
      'Unknown Course "ENG": add it, link it to a Course, or ignore it',
      "Auto Changes are paused: new announcements aren't applied",
    ]);
    expect(selectDigest([], new Set(), "2026-11-20", { ...NOTHING, paused: true })).not.toBeNull();
  });
});
