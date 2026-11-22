import * as z from "zod";
import { Id } from "./common";
import { Course, CourseCreate } from "./course";

/** A WhatsApp message as the Activity Log shows it; text is null once its Semester is archived (D1). */
const Message = z.object({ senderName: z.string().nullable(), sentAt: z.string(), text: z.string().nullable(), groupSubject: z.string() });

export const AutoChangeItem = z.object({
  id: Id,
  createdAt: z.string(),
  summary: z.string(),
  risk: z.enum(["normal", "moved_later", "cancelled"]),
  undoneAt: z.string().nullable(),
  entityType: z.enum(["assignment", "exam", "session_change", "semester"]),
  entityId: Id,
  batchId: Id,
  batchOpen: z.number(), // changes of this batch not undone yet: "Undo batch" shows when there's more than one
  canUndo: z.boolean(),
  undoBlockedReason: z.string().nullable(),
  sources: z.array(Message),
});
export type AutoChangeItem = z.infer<typeof AutoChangeItem>;

/** `reason` is the AI's, when it called the message possibly missed; `courseId` is the group's Course, for the Add form. */
export const PossiblyMissedItem = Message.extend({ type: z.literal("possibly_missed"), inboxMessageId: Id, reason: z.string().nullable(), courseId: Id.nullable(), createdAt: z.string() });
export type PossiblyMissedItem = z.infer<typeof PossiblyMissedItem>;
export const UnknownCourseItem = z.object({
  type: z.literal("unknown_course"), id: Id, name: z.string(), status: z.enum(["open", "added", "mapped", "ignored"]), operations: z.number(), firstMessage: Message.nullable(), createdAt: z.string(),
});
export type UnknownCourseItem = z.infer<typeof UnknownCourseItem>;

export const ActivityItem = z.discriminatedUnion("type", [
  AutoChangeItem.extend({ type: z.literal("auto_change") }),
  PossiblyMissedItem,
  UnknownCourseItem,
  z.object({ type: z.literal("event"), id: Id, kind: z.string(), payload: z.record(z.string(), z.unknown()), createdAt: z.string() }),
]);
export type ActivityItem = z.infer<typeof ActivityItem>;
export const ActivityPage = z.object({ items: z.array(ActivityItem), nextCursor: z.string().nullable() });
/** Filter chips (design-system §7.7): everything, Auto Changes only, or what needs the Student's attention. */
export const ACTIVITY_FILTERS = ["all", "changes", "attention"] as const;
export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];
/** `cursor`: the last item's time and id ("<ISO time>|<uuid>"), from the previous page's nextCursor. */
export const ActivityQuery = z.strictObject({
  cursor: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\|[0-9a-f-]{36}$/, "Not a page cursor").optional(),
  filter: z.enum(ACTIVITY_FILTERS).optional(),
});

/** Undo batch (#22): what was undone and what was skipped, with the reason. */
export const BatchUndoResult = z.object({
  undone: z.array(z.object({ autoChangeId: Id, summary: z.string() })),
  skipped: z.array(z.object({ autoChangeId: Id, summary: z.string(), reason: z.string() })),
});
export type BatchUndoResult = z.infer<typeof BatchUndoResult>;

/** Add course (in the current Semester), Nickname of an existing Course, or Ignore (design file 46). */
export const UnknownCourseResolve = z.discriminatedUnion("action", [
  CourseCreate.omit({ semesterId: true }).extend({ action: z.literal("add") }),
  z.strictObject({ action: z.literal("nickname"), courseId: z.uuid({ error: "Choose a Course" }) }),
  z.strictObject({ action: z.literal("ignore") }),
]);
export type UnknownCourseResolve = z.output<typeof UnknownCourseResolve>;
export const ResolveResult = z.object({ applied: z.number(), possiblyMissed: z.number(), course: Course.nullable() });
export type ResolveResult = z.infer<typeof ResolveResult>;
