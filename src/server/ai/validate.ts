// Validation of the AI's output before anything is applied (design §9): schema, then "every reference is real",
// then volume. Pure, so it's unit-tested (90% branch coverage target).
import * as z from "zod";
import { titleKey } from "@/server/domain/auto-change";
import { addDays } from "@/server/domain/time";
import { type Operation, opsV1 } from "@/shared/schemas/ai-ops";
import type { AiContext } from "./context";

export const MAX_OPERATIONS = 10;
type Decision = { decision: z.infer<typeof opsV1>["messages"][number]["decision"]; reason: string };
export type Dropped = { op: Operation; reason: string; messageIds: string[] };
// Dropped because the item was already handled: not Possibly Missed.
export const SUPERSEDED = "superseded: the Student dismissed this before";
export const REPEATS = "repeats an existing item";
export type Validated =
  | { ok: false; error: string }
  | { ok: true; decisions: Map<string, Decision>; valid: Operation[]; dropped: Dropped[]; overflow: Operation[]; unknownCourses: z.infer<typeof opsV1>["unknownCourses"] };

const TIMETABLE = new Set(["cancel_occurrence", "reschedule_occurrence", "add_extra_session", "update_session_change", "remove_session_change", "extend_semester"]);

export function validateOutput(raw: string, ctx: AiContext): Validated {
  let data: unknown;
  try {
    data = JSON.parse(raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch (e) {
    return { ok: false, error: `not JSON: ${(e as Error).message}` };
  }
  const parsed = opsV1.safeParse(data);
  if (!parsed.success) return { ok: false, error: z.prettifyError(parsed.error) };

  const batchIds = new Set(ctx.messages.map((m) => m.id));
  const courses = new Set(ctx.courses.map((c) => c.id));
  const assignments = new Map(ctx.assignments.map((a) => [a.id, a]));
  const exams = new Map(ctx.exams.map((e) => [e.id, e]));
  const sem = ctx.semester;
  const inSemester = (d: string | null | undefined, exam = false) => !d || !sem || (d >= sem.startDate && d <= (exam ? addDays(sem.endDate, 60) : sem.endDate));
  const same = (entityType: "assignment" | "exam", courseId: string, title: string, date: string | null | undefined) => (x: { courseId: string; title: string; date?: string | null; dueDate?: string | null }) =>
    x.courseId === courseId && titleKey(x.title) === titleKey(title) && (x.dueDate ?? x.date ?? null) === (date ?? null) && (entityType === "assignment" ? "dueDate" in x : "date" in x);

  /** Why an operation can't be applied, or null when it can. */
  function problem(op: Operation): string | null {
    if (!op.sourceMessageIds.every((id) => batchIds.has(id))) return "source message not in this batch";
    if (TIMETABLE.has(op.op)) return "timetable changes aren't applied yet";
    switch (op.op) {
      case "create_assignment":
      case "create_exam": {
        if (!courses.has(op.courseId)) return "unknown Course";
        const isA = op.op === "create_assignment";
        const date = isA ? op.dueDate : op.date;
        if (!inSemester(date, !isA)) return "date outside the Semester";
        const type = isA ? "assignment" : "exam";
        if (ctx.suppressions.some((s) => s.entityType === type && s.courseId === op.courseId && titleKey(s.title) === titleKey(op.title) && s.dueDate === (date ?? null)))
          return SUPERSEDED;
        const existing = isA ? ctx.assignments : ctx.exams;
        if (existing.some(same(type, op.courseId, op.title, date))) return REPEATS;
        return null;
      }
      case "update_assignment":
      case "cancel_assignment":
        if (!assignments.has(op.assignmentId)) return "unknown Assignment";
        return op.op === "update_assignment" && !inSemester(op.fields.dueDate) ? "date outside the Semester" : null;
      case "update_exam":
      case "cancel_exam":
        if (!exams.has(op.examId)) return "unknown Exam";
        return op.op === "update_exam" && !inSemester(op.fields.date, true) ? "date outside the Semester" : null;
      default:
        return "not supported";
    }
  }

  const valid: Operation[] = [];
  const dropped: Dropped[] = [];
  for (const op of parsed.data.operations) {
    const reason = problem(op);
    if (reason) dropped.push({ op, reason, messageIds: op.sourceMessageIds });
    else valid.push(op);
  }
  return {
    ok: true,
    decisions: new Map(parsed.data.messages.map((m) => [m.id, { decision: m.decision, reason: m.reason }])),
    valid: valid.slice(0, MAX_OPERATIONS),
    overflow: valid.slice(MAX_OPERATIONS),
    dropped,
    unknownCourses: parsed.data.unknownCourses,
  };
}
