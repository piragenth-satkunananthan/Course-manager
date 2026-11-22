// Validation of the AI's output before anything is applied (design §9): schema, then "every reference is real",
// then volume. Pure, so it's unit-tested (90% branch coverage target).
import * as z from "zod";
import { titleKey } from "@/server/domain/auto-change";
import { addDays, weekdayOf } from "@/server/domain/time";
import { CHANGE_KIND, type Operation, opsV1 } from "@/shared/schemas/ai-ops";
import type { AiContext } from "./context";

export const MAX_OPERATIONS = 10;
type Decision = { decision: z.infer<typeof opsV1>["messages"][number]["decision"]; reason: string };
export type Dropped = { op: Operation; reason: string; messageIds: string[] };
// Dropped because the item was already handled: not Possibly Missed.
export const SUPERSEDED = "superseded: the Student dismissed this before";
export const REPEATS = "repeats an existing item";
export const isHandled = (reason: string) => reason === REPEATS || reason === SUPERSEDED;
export type Validated =
  | { ok: false; error: string }
  | { ok: true; decisions: Map<string, Decision>; valid: Operation[]; dropped: Dropped[]; overflow: Operation[]; unknownCourses: z.infer<typeof opsV1>["unknownCourses"] };

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
  // Dates are checked against the end after any valid extension in this batch (design §9, rule 1).
  const extensions = parsed.data.operations.flatMap((o) => (o.op === "extend_semester" && ctx.semester && o.semesterId === ctx.semester.id && o.newEndDate > ctx.semester.endDate ? [o.newEndDate] : []));
  const sem = ctx.semester && { ...ctx.semester, endDate: [ctx.semester.endDate, ...extensions].sort().at(-1)! };
  const inSemester = (d: string | null | undefined, exam = false) => !d || !sem || (d >= sem.startDate && d <= (exam ? addDays(sem.endDate, 60) : sem.endDate));
  // A weekly class is named by its original date; a rescheduled one shows on its new date with originalDate set.
  // Weeks an extension in this batch adds aren't in the context yet: there, a class is its usual weekday.
  const weekday = new Map(ctx.occurrences.flatMap((o) => (o.classSessionId && o.status === "normal" ? [[o.classSessionId, weekdayOf(o.date)] as const] : [])));
  const isClass = (classSessionId: string, date: string) =>
    ctx.occurrences.some((o) => o.classSessionId === classSessionId && (o.originalDate ?? o.date) === date) ||
    (!!ctx.semester && date > ctx.semester.endDate && date <= sem!.endDate && weekday.get(classSessionId) === weekdayOf(date));
  const changes = new Map(ctx.occurrences.flatMap((o) => (o.sessionChangeId ? [[o.sessionChangeId, o] as const] : [])));
  const times = (start: string | null | undefined, end: string | null | undefined) => (start && end && end <= start ? "the end is before the start" : null);
  const same = (entityType: "assignment" | "exam", courseId: string, title: string, date: string | null | undefined) => (x: { courseId: string; title: string; date?: string | null; dueDate?: string | null }) =>
    x.courseId === courseId && titleKey(x.title) === titleKey(title) && (x.dueDate ?? x.date ?? null) === (date ?? null) && (entityType === "assignment" ? "dueDate" in x : "date" in x);

  /** Why an operation can't be applied, or null when it can. */
  function problem(op: Operation): string | null {
    if (!op.sourceMessageIds.every((id) => batchIds.has(id))) return "source message not in this batch";
    switch (op.op) {
      case "cancel_occurrence":
        return isClass(op.classSessionId, op.date) ? null : "not a class in the timetable";
      case "reschedule_occurrence":
        if (!isClass(op.classSessionId, op.date)) return "not a class in the timetable";
        return times(op.newStart, op.newEnd) ?? (inSemester(op.newDate) ? null : "date outside the Semester");
      case "add_extra_session":
        if (!courses.has(op.courseId)) return "unknown Course";
        if (ctx.occurrences.some((o) => o.status === "extra" && o.courseId === op.courseId && o.date === op.date && o.start === op.start)) return REPEATS;
        return times(op.start, op.end) ?? (inSemester(op.date) ? null : "date outside the Semester");
      case "update_session_change": {
        const c = changes.get(op.sessionChangeId);
        if (!c) return "unknown Session Change";
        const kind = op.fields.kind ? CHANGE_KIND[op.fields.kind] : c.status === "extra" ? "extra" : c.status === "cancelled" ? "cancel" : "reschedule";
        if ((c.status === "extra") !== (kind === "extra")) return "an extra session can't become a change to a weekly class";
        if (kind === "cancel") return null;
        // The change as it would be: a cancelled one has no new date or times of its own yet.
        const had = c.status !== "cancelled";
        const date = op.fields.newDate ?? (had ? c.date : null);
        const start = op.fields.newStart ?? (had ? c.start : null);
        const end = op.fields.newEnd ?? (had ? c.end : null);
        if (!date || !start || !end) return "give the new date, start and end";
        return times(start, end) ?? (inSemester(date) ? null : "date outside the Semester");
      }
      case "remove_session_change":
        return changes.has(op.sessionChangeId) ? null : "unknown Session Change";
      case "extend_semester":
        if (!ctx.semester || op.semesterId !== ctx.semester.id) return "unknown Semester";
        return op.newEndDate > ctx.semester.endDate ? null : "the Semester can only end later";
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
