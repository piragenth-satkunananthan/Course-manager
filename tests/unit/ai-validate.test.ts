import { describe, expect, it } from "vitest";
import type { AiContext } from "@/server/ai/context";
import { validateOutput } from "@/server/ai/validate";

const ctx: AiContext = {
  now: "2026-11-20 10:00",
  timeZone: "Asia/Colombo",
  semester: { id: "sem", startDate: "2026-08-03", endDate: "2026-12-18" },
  linkedTo: { courseId: "c1" },
  courses: [{ id: "c1", code: "CS2010", name: "Data Structures", nicknames: ["ds"] }],
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

  it("drops timetable and Semester operations until they are supported (#16)", () => {
    const r = validateOutput(out([{ op: "cancel_occurrence", classSessionId: "s1", date: "2026-11-26", sourceMessageIds: ["m2"] }]), ctx);
    expect(r.ok && r.dropped).toMatchObject([{ reason: "timetable changes aren't applied yet", messageIds: ["m2"] }]);
  });
});

describe("validateOutput: volume", () => {
  it("applies at most 10 operations and returns the rest as overflow", () => {
    const ops = Array.from({ length: 12 }, (_, i) => create({ title: `Lab ${20 + i}` }));
    const r = validateOutput(out(ops), ctx);
    expect(r.ok && [r.valid.length, r.overflow.length]).toEqual([10, 2]);
  });
});
