import { describe, expect, it } from "vitest";
import { isDigestWindow, selectDigest } from "@/server/domain/digest";
import { dueForFinalReminder, notifyProblems, type NotifyPrefs, remindersDue } from "@/server/domain/reminders";

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

// #79 (U44): the Student's notification settings. Colombo = UTC+5:30.
describe("notification settings", () => {
  const prefs: NotifyPrefs = { digestOn: true, digestTime: "07:00", digestDays: 2, reminderHours: 4, secondReminderHours: null, quietStart: null, quietEnd: null };
  const at = (colombo: string) => new Date(Date.parse(`2026-11-20T${colombo}:00+05:30`));

  it("sends the digest from its chosen time for two hours, never when it's off", () => {
    const p = { ...prefs, digestTime: "09:30" };
    expect([at("09:29"), at("09:30"), at("11:29"), at("11:30")].map((n) => isDigestWindow(n, p))).toEqual([false, true, true, false]);
    expect(isDigestWindow(at("09:30"), { ...p, digestOn: false })).toBe(false);
  });

  it("lists the chosen number of days in Due soon", () => {
    const open = [d("today", null, "2026-11-20"), d("in-4", null, "2026-11-24"), d("in-5", null, "2026-11-25")];
    expect(selectDigest(open, new Set(), "2026-11-20", NOTHING, 4)!.dueSoon.map((x) => x.id)).toEqual(["today", "in-4"]);
  });

  it("uses the chosen lead time for the Final Reminder", () => {
    const deadlines = [d("in-1h", "2026-11-20T05:30:00Z"), d("in-2h", "2026-11-20T06:30:00Z")];
    expect(dueForFinalReminder(deadlines, NOW, { ...prefs, reminderHours: 1 }).map((x) => x.id)).toEqual(["in-1h"]);
  });

  const kinds = (deadlines: ReturnType<typeof d>[], now: Date, p: NotifyPrefs) => remindersDue(deadlines, now, p).map((r) => `${r.item.id}:${r.kind}`);

  it("sends a second reminder once, from its lead time until the Final Reminder takes over", () => {
    const p = { ...prefs, secondReminderHours: 24 };
    const tomorrowNoon = d("report", "2026-11-21T06:30:00Z"); // Sat 21 Nov, 12:00 Colombo
    expect(kinds([tomorrowNoon], at("11:59"), p)).toEqual([]);
    expect(kinds([tomorrowNoon], at("12:00"), p)).toEqual(["report:second"]);
    expect(kinds([tomorrowNoon], new Date("2026-11-21T02:30:00Z"), p)).toEqual(["report:final"]); // 08:00 on the day
  });

  it("brings a reminder that would fall in quiet hours forward to just before they start", () => {
    const p = { ...prefs, quietStart: "22:00", quietEnd: "06:00" };
    const early = d("early", "2026-11-20T21:30:00Z"); // Sat 21 Nov, 03:00 Colombo: due 4 h earlier is 23:00, inside quiet hours
    expect(kinds([early], at("21:59"), p)).toEqual([]);
    expect(kinds([early], at("22:00"), p)).toEqual(["early:final"]); // as quiet hours start, not at 23:00
    expect(kinds([early], at("18:00"), { ...p, quietStart: null })).toEqual([]); // with no quiet hours, still 23:00
  });

  it("refuses a digest time inside quiet hours, half-set quiet hours, and a second reminder no earlier than the Final Reminder", () => {
    expect(notifyProblems(prefs)).toEqual({});
    expect(notifyProblems({ ...prefs, quietStart: "06:00", quietEnd: "08:00" })).toEqual({ digestTime: "The digest can't be sent during quiet hours" });
    expect(notifyProblems({ ...prefs, digestOn: false, quietStart: "06:00", quietEnd: "08:00" })).toEqual({});
    expect(notifyProblems({ ...prefs, quietStart: "22:00" })).toEqual({ quietEnd: "Choose when quiet hours end" });
    expect(notifyProblems({ ...prefs, quietStart: "22:00", quietEnd: "22:00" })).toEqual({ quietEnd: "Quiet hours must end at a different time" });
    expect(notifyProblems({ ...prefs, reminderHours: 24, secondReminderHours: 24 })).toEqual({ secondReminderHours: "The second reminder must come before the Final Reminder" });
  });

  it("sends a reminder whose time has already passed even inside quiet hours: a Deadline that close is urgent", () => {
    const p = { ...prefs, quietStart: "22:00", quietEnd: "06:00" };
    const soon = d("soon", "2026-11-20T19:30:00Z"); // Sat 21 Nov, 01:00 Colombo, added at 23:00
    expect(kinds([soon], at("23:00"), p)).toEqual(["soon:final"]);
  });

  it("doesn't send a late digest once quiet hours have begun", () => {
    const p = { ...prefs, digestTime: "08:30", quietStart: "09:00", quietEnd: "12:00" };
    expect([at("08:30"), at("08:59"), at("09:00")].map((n) => isDigestWindow(n, p))).toEqual([true, true, false]);
  });
});
