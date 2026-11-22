import { describe, expect, it } from "vitest";
import type { AiContext } from "@/server/ai/context";
import { validateOutput } from "@/server/ai/validate";

const ctx: AiContext = {
  now: "2026-11-20 10:00",
  timeZone: "Asia/Colombo",
  semester: { id: "sem", startDate: "2026-08-03", endDate: "2026-12-18" },
  linkedTo: { courseId: "c1" },
  courses: [{ id: "c1", code: "CS2010", name: "Data Structures", nicknames: ["ds"] }],
  occurrences: [
    { classSessionId: "s1", courseId: "c1", kind: "lecture", date: "2026-11-23", start: "08:00", end: "10:00", location: "Hall A", status: "normal", originalDate: null, sessionChangeId: null },
    { classSessionId: "s1", courseId: "c1", kind: "lecture", date: "2026-11-30", start: "08:00", end: "10:00", location: "Hall A", status: "cancelled", originalDate: null, sessionChangeId: "sc1" },
    { classSessionId: "s1", courseId: "c1", kind: "lecture", date: "2026-12-08", start: "13:00", end: "15:00", location: null, status: "rescheduled", originalDate: "2026-12-07", sessionChangeId: "sc3" },
    { classSessionId: null, courseId: "c1", kind: "lab", date: "2026-11-28", start: "09:00", end: "11:00", location: "Mac Lab", status: "extra", originalDate: null, sessionChangeId: "sc2" },
  ],
  assignments: [
    { id: "a1", courseId: "c1", title: "Lab 4 report", dueDate: "2026-11-27", dueTime: null, status: "todo" },
    { id: "a2", courseId: "c1", title: "Lab 3", dueDate: "2026-11-13", dueTime: null, status: "submitted" },
  ],
  exams: [{ id: "e1", courseId: "c1", title: "Mid-term", kindLabel: null, date: null, startTime: null }],
  suppressions: [{ courseId: "c1", entityType: "assignment", title: "Lab 9", dueDate: "2026-12-01" }],
  recentMessages: [],
  messages: [
    { id: "m1", sender: "A", sentAt: "2026-11-20T04:00:00Z", kind: "text", text: "…", editOf: null },
    { id: "m2", sender: "B", sentAt: "2026-11-20T04:01:00Z", kind: "text", text: "…", editOf: null },
  ],
};
const out = (operations: unknown[], extra: object = {}) =>
  JSON.stringify({ messages: [{ id: "m1", decision: "applied", reason: "r" }, { id: "m2", decision: "ignored", reason: "r" }], operations, unknownCourses: [], ...extra });
const create = (o: object = {}) => ({ op: "create_assignment", courseId: "c1", title: "Lab 5", dueDate: "2026-12-04", sourceMessageIds: ["m1"], ...o });
const reasons = (r: ReturnType<typeof validateOutput>) => (r.ok ? r.dropped.map((d) => d.reason) : []);

describe("validateOutput: schema", () => {
  it("rejects output that isn't ops.v1, including extra keys and fields the AI doesn't own", () => {
    expect(validateOutput("nope", ctx)).toMatchObject({ ok: false });
    expect(validateOutput(out([{ ...create(), status: "submitted" }]), ctx)).toMatchObject({ ok: false, error: expect.stringMatching(/status/) });
  });

  it("accepts valid output, keeping decisions", () => {
    const r = validateOutput(out([create()]), ctx);
    expect(r).toMatchObject({ ok: true, valid: [create()], dropped: [], overflow: [] });
    expect(r.ok && r.decisions.get("m2")).toEqual({ decision: "ignored", reason: "r" });
  });
});

describe("validateOutput: every reference is real", () => {
  it("drops ids that weren't in the context and source messages outside the batch", () => {
    const r = validateOutput(
      out([
        create({ courseId: "c9" }),
        { op: "update_assignment", assignmentId: "a9", fields: { title: "x" }, sourceMessageIds: ["m1"] },
        { op: "cancel_exam", examId: "e9", sourceMessageIds: ["m1"] },
        create({ sourceMessageIds: ["m7"] }),
      ]),
      ctx,
    );
    expect(reasons(r)).toEqual(["unknown Course", "unknown Assignment", "unknown Exam", "source message not in this batch"]);
  });

  it("drops dates outside the Semester (Exams may run 60 days past its end)", () => {
    const r = validateOutput(
      out([
        create({ dueDate: "2027-01-10" }),
        { op: "create_exam", courseId: "c1", title: "Final", date: "2027-02-10", sourceMessageIds: ["m1"] },
        { op: "create_exam", courseId: "c1", title: "Final", date: "2027-02-20", sourceMessageIds: ["m1"] },
        { op: "update_assignment", assignmentId: "a1", fields: { dueDate: "2026-07-01" }, sourceMessageIds: ["m1"] },
      ]),
      ctx,
    );
    expect(r.ok && r.valid.map((o) => o.op)).toEqual(["create_exam"]);
    expect(reasons(r)).toEqual(["date outside the Semester", "date outside the Semester", "date outside the Semester"]);
  });

  it("skips a create the Student dismissed (a suppression) and one that repeats an existing item, submitted or not", () => {
    const r = validateOutput(out([create({ title: "Lab 9", dueDate: "2026-12-01" }), create({ title: "lab 3 ", dueDate: "2026-11-13" }), create({ title: "LAB 4 REPORT", dueDate: "2026-11-27" })]), ctx);
    expect(reasons(r)).toEqual(["superseded: the Student dismissed this before", "repeats an existing item", "repeats an existing item"]);
  });
});

describe("validateOutput: volume", () => {
  it("applies at most 10 operations and returns the rest as overflow", () => {
    const ops = Array.from({ length: 12 }, (_, i) => create({ title: `Lab ${20 + i}` }));
    const r = validateOutput(out(ops), ctx);
    expect(r.ok && [r.valid.length, r.overflow.length]).toEqual([10, 2]);
  });
});

describe("validateOutput: the timetable and the Semester (#16)", () => {
  const src = { sourceMessageIds: ["m1"] };
  const ok = [
    { op: "cancel_occurrence", classSessionId: "s1", date: "2026-11-23", ...src },
    { op: "cancel_occurrence", classSessionId: "s1", date: "2026-12-07", ...src }, // a rescheduled one, by its original date
    { op: "reschedule_occurrence", classSessionId: "s1", date: "2026-11-23", newDate: "2026-11-24", newStart: "13:00", newEnd: "15:00", ...src },
    { op: "add_extra_session", courseId: "c1", kind: "lecture", date: "2026-11-28", start: "09:00", end: "11:00", ...src },
    { op: "update_session_change", sessionChangeId: "sc1", fields: { kind: "rescheduled", newDate: "2026-12-01", newStart: "08:00", newEnd: "10:00" }, ...src },
    { op: "update_session_change", sessionChangeId: "sc3", fields: { newStart: "14:00", newEnd: "16:00" }, ...src },
    { op: "update_session_change", sessionChangeId: "sc2", fields: { newLocation: "Lab 2" }, ...src },
    { op: "remove_session_change", sessionChangeId: "sc2", ...src },
  ];

  it("accepts operations on real occurrences and Session Changes", () => {
    const r = validateOutput(out(ok), ctx);
    expect(reasons(r)).toEqual([]);
    expect(r.ok && r.valid).toHaveLength(ok.length);
  });

  it("drops operations on classes that aren't in the timetable, and impossible times or dates", () => {
    const r = validateOutput(
      out([
        { op: "cancel_occurrence", classSessionId: "s1", date: "2026-11-24", ...src },
        { op: "cancel_occurrence", classSessionId: "s9", date: "2026-11-23", ...src },
        { op: "reschedule_occurrence", classSessionId: "s1", date: "2026-11-23", newDate: "2026-11-24", newStart: "15:00", newEnd: "13:00", ...src },
        { op: "reschedule_occurrence", classSessionId: "s1", date: "2026-11-23", newDate: "2026-12-21", newStart: "13:00", newEnd: "15:00", ...src },
        { op: "add_extra_session", courseId: "c9", kind: "lab", date: "2026-11-28", start: "09:00", end: "11:00", ...src },
        { op: "add_extra_session", courseId: "c1", kind: "lab", date: "2027-01-05", start: "09:00", end: "11:00", ...src },
        { op: "update_session_change", sessionChangeId: "sc9", fields: { newStart: "09:00" }, ...src },
        { op: "update_session_change", sessionChangeId: "sc1", fields: { kind: "rescheduled" }, ...src },
        { op: "update_session_change", sessionChangeId: "sc3", fields: { newEnd: "12:00" }, ...src },
        { op: "update_session_change", sessionChangeId: "sc2", fields: { kind: "cancelled" }, ...src },
        { op: "remove_session_change", sessionChangeId: "sc9", ...src },
      ]),
      ctx,
    );
    expect(reasons(r)).toEqual([
      "not a class in the timetable",
      "not a class in the timetable",
      "the end is before the start",
      "date outside the Semester",
      "unknown Course",
      "date outside the Semester",
      "unknown Session Change",
      "give the new date, start and end",
      "the end is before the start",
      "an extra session can't become a change to a weekly class",
      "unknown Session Change",
    ]);
  });

  it("extends the Semester only later, and checks the batch's other dates against the extended end", () => {
    const extend = (newEndDate: string, semesterId = "sem") => ({ op: "extend_semester", semesterId, newEndDate, ...src });
    const late = create({ dueDate: "2026-12-30" });
    expect(reasons(validateOutput(out([late]), ctx))).toEqual(["date outside the Semester"]);
    expect(reasons(validateOutput(out([late, extend("2027-01-01")]), ctx))).toEqual([]);
    expect(reasons(validateOutput(out([extend("2026-12-10"), extend("2027-01-01", "other")]), ctx))).toEqual(["the Semester can only end later", "unknown Semester"]);
  });
});
