// The AI output contract, ops.v1 (design §9, file 30): a strict union on `op` with no extra keys. Changing it means a
// new version, a new prompt version and a re-run of the evaluation (scripts/ai-eval.ts).
import * as z from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const id = z.string().min(1);
const src = { sourceMessageIds: z.array(id).min(1) };

const createAssignment = z.strictObject({
  op: z.literal("create_assignment"), courseId: id, title: z.string(), dueDate: date, dueTime: time.optional(),
  description: z.string().optional(), submitWhere: z.string().optional(), isGroupWork: z.boolean().optional(), ...src,
});
const createExam = z.strictObject({
  op: z.literal("create_exam"), courseId: id, title: z.string(), kindLabel: z.string().optional(), date: date.optional(),
  startTime: time.optional(), location: z.string().optional(), topics: z.string().optional(), ...src,
});
const addExtraSession = z.strictObject({
  op: z.literal("add_extra_session"), courseId: id, kind: z.enum(["lecture", "tutorial", "lab"]),
  date, start: time, end: time, location: z.string().optional(), ...src,
});

export const operation = z.discriminatedUnion("op", [
  createAssignment,
  z.strictObject({
    op: z.literal("update_assignment"), assignmentId: id,
    fields: createAssignment.pick({ title: true, dueDate: true, dueTime: true, description: true, submitWhere: true, isGroupWork: true }).partial(),
    ...src,
  }),
  z.strictObject({ op: z.literal("cancel_assignment"), assignmentId: id, ...src }),
  createExam,
  z.strictObject({
    op: z.literal("update_exam"), examId: id,
    fields: createExam.pick({ title: true, kindLabel: true, date: true, startTime: true, location: true, topics: true }).partial(),
    ...src,
  }),
  z.strictObject({ op: z.literal("cancel_exam"), examId: id, ...src }),
  z.strictObject({ op: z.literal("cancel_occurrence"), classSessionId: id, date, ...src }),
  z.strictObject({
    op: z.literal("reschedule_occurrence"), classSessionId: id, date, newDate: date, newStart: time, newEnd: time,
    newLocation: z.string().optional(), ...src,
  }),
  addExtraSession,
  z.strictObject({
    op: z.literal("update_session_change"), sessionChangeId: id,
    fields: z.strictObject({
      kind: z.enum(["cancelled", "rescheduled", "extra"]), newDate: date, newStart: time, newEnd: time, newLocation: z.string(),
    }).partial(),
    ...src,
  }),
  z.strictObject({ op: z.literal("remove_session_change"), sessionChangeId: id, ...src }),
  z.strictObject({ op: z.literal("extend_semester"), semesterId: id, newEndDate: date, ...src }),
]);

// Unknown Courses carry only creates, with courseId null until the Student resolves them.
const proposed = z.discriminatedUnion("op", [
  createAssignment.extend({ courseId: z.null() }),
  createExam.extend({ courseId: z.null() }),
  addExtraSession.extend({ courseId: z.null() }),
]);

/** update_session_change speaks "cancelled|rescheduled|extra"; the session_change table stores these. */
export const CHANGE_KIND = { cancelled: "cancel", rescheduled: "reschedule", extra: "extra" } as const;

export const DECISIONS = ["applied", "question", "ignored", "unknown_course", "possibly_missed"] as const;

export const opsV1 = z.strictObject({
  messages: z.array(z.strictObject({ id, decision: z.enum(DECISIONS), reason: z.string() })),
  operations: z.array(operation),
  unknownCourses: z.array(z.strictObject({ name: z.string(), messageIds: z.array(id), proposedOperations: z.array(proposed) })),
});

export type Operation = z.infer<typeof operation>;
export type OpsV1 = z.infer<typeof opsV1>;
export const OPS_SCHEMA_VERSION = "ops.v1";
export const opsV1JsonSchema = () => z.toJSONSchema(opsV1);
