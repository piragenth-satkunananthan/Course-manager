import { describe, expect, it } from "vitest";
import { gradeCase, summarise, type EvalCase } from "../../scripts/lib/score";

const deadlineCase: EvalCase = {
  id: "time-4-30-afternoon",
  category: "times",
  now: "2026-11-21T10:00:00+05:30",
  fixture: {},
  thread: [
    { id: "m1", senderName: "Kavin", sentAt: "2026-11-21T09:00:00+05:30", kind: "original", text: "DS lab report due friday 4.30" },
    { id: "m2", senderName: "Nila", sentAt: "2026-11-21T09:01:00+05:30", kind: "original", text: "who has the slides?" },
  ],
  expected: {
    operations: [
      { op: "create_assignment", courseId: "c-ds", title: "Lab report", dueDate: "2026-11-27", dueTime: "16:30", sourceMessageIds: ["m1"] },
    ],
    decisions: { m1: "applied", m2: "question" },
  },
};

const output = (ops: unknown[], decisions = { m1: "applied", m2: "question" }) =>
  JSON.stringify({
    messages: Object.entries(decisions).map(([id, decision]) => ({ id, decision, reason: "r" })),
    operations: ops,
    unknownCourses: [],
  });

const good = { op: "create_assignment", courseId: "c-ds", title: "DS lab report", dueDate: "2026-11-27", dueTime: "16:30", sourceMessageIds: ["m1"] };

describe("gradeCase", () => {
  it("passes when operations and decisions match, ignoring free-text wording", () => {
    const g = gradeCase(deadlineCase, output([good]));
    expect(g).toMatchObject({ pass: true, deadline: true, missing: [], extra: [] });
  });

  it("fails a wrong due time as one missing and one extra operation", () => {
    const g = gradeCase(deadlineCase, output([{ ...good, dueTime: "04:30" }]));
    expect(g.pass).toBe(false);
    expect(g.missing).toHaveLength(1);
    expect(g.extra).toHaveLength(1);
  });

  it("fails a wrong decision even when operations match", () => {
    const g = gradeCase(deadlineCase, output([good], { m1: "applied", m2: "ignored" }));
    expect(g.pass).toBe(false);
    expect(g.decisionErrors).toEqual([{ id: "m2", expected: "question", actual: "ignored" }]);
  });

  it("ignores operation order and sourceMessageIds order", () => {
    const c: EvalCase = {
      ...deadlineCase,
      expected: {
        operations: [
          { op: "cancel_occurrence", classSessionId: "s1", date: "2026-11-24", sourceMessageIds: ["m1", "m2"] },
          { op: "extend_semester", semesterId: "sem", newEndDate: "2027-01-10", sourceMessageIds: ["m2"] },
        ],
        decisions: { m1: "applied", m2: "applied" },
      },
    };
    const g = gradeCase(c, output([c.expected.operations[1], { ...(c.expected.operations[0] as object), sourceMessageIds: ["m2", "m1"] }], { m1: "applied", m2: "applied" }));
    expect(g).toMatchObject({ pass: true, deadline: false });
  });

  it("fails output that is not valid ops.v1, including extra keys", () => {
    expect(gradeCase(deadlineCase, "not json").schemaError).toBeTruthy();
    const g = gradeCase(deadlineCase, output([{ ...good, status: "submitted" }]));
    expect(g.pass).toBe(false);
    expect(g.schemaError).toMatch(/status/);
  });

  it("counts a case as a deadline case when the model invents a deadline", () => {
    const chatter: EvalCase = { ...deadlineCase, expected: { operations: [], decisions: { m1: "ignored", m2: "question" } } };
    const g = gradeCase(chatter, output([good], { m1: "ignored", m2: "question" }));
    expect(g).toMatchObject({ pass: false, deadline: true });
    expect(gradeCase(chatter, output([], { m1: "ignored", m2: "question" }))).toMatchObject({ pass: true, deadline: false });
  });

  it("compares locations ignoring case and spacing", () => {
    const c: EvalCase = {
      ...deadlineCase,
      expected: {
        operations: [{ op: "reschedule_occurrence", classSessionId: "s1", date: "2026-11-24", newDate: "2026-11-25", newStart: "15:00", newEnd: "17:00", newLocation: "Lab 2", sourceMessageIds: ["m1"] }],
        decisions: deadlineCase.expected.decisions,
      },
    };
    const op = c.expected.operations[0] as object;
    expect(gradeCase(c, output([{ ...op, newLocation: " lab  2" }])).pass).toBe(true);
    expect(gradeCase(c, output([{ ...op, newLocation: "Hall B" }])).pass).toBe(false);
  });

  it("accepts JSON wrapped in a markdown fence", () => {
    expect(gradeCase(deadlineCase, "```json\n" + output([good]) + "\n```").pass).toBe(true);
  });
});

describe("summarise", () => {
  it("reports the deadline score separately and applies the pass bar", () => {
    const pass = gradeCase(deadlineCase, output([good]));
    const fail = gradeCase(deadlineCase, output([]));
    const chatter = { ...pass, id: "chatter", deadline: false };
    expect(summarise([pass, chatter])).toMatchObject({ deadlineScore: 1, overallScore: 1, go: true });
    const s = summarise([pass, fail, chatter]);
    expect(s).toMatchObject({ deadlineScore: 0.5, missedDeadlineOps: 1, go: false });
    expect(s.overallScore).toBeCloseTo(2 / 3);
  });
});

describe("defaults", () => {
  it("treats a create that spells out the app's defaults (23:59, not group work) as the same create", async () => {
    const { gradeCase } = await import("../../scripts/lib/score");
    const op = { op: "create_assignment", courseId: "c", title: "A", dueDate: "2026-11-20", sourceMessageIds: ["m1"] };
    const c = { id: "x", category: "t", now: "", fixture: {}, thread: [], expected: { operations: [op], decisions: { m1: "applied" } } };
    const out = (o: object) => JSON.stringify({ messages: [{ id: "m1", decision: "applied", reason: "r" }], operations: [{ ...op, ...o }], unknownCourses: [] });
    expect(gradeCase(c as never, out({ dueTime: "23:59", isGroupWork: false })).pass).toBe(true);
    expect(gradeCase(c as never, out({ dueTime: "17:00" })).pass).toBe(false);
  });
});
