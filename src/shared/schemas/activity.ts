import * as z from "zod";
import { Id } from "./common";

export const AutoChangeItem = z.object({
  id: Id,
  createdAt: z.string(),
  summary: z.string(),
  risk: z.enum(["normal", "moved_later", "cancelled"]),
  undoneAt: z.string().nullable(),
  entityType: z.enum(["assignment", "exam", "session_change", "semester"]),
  entityId: Id,
  canUndo: z.boolean(),
  undoBlockedReason: z.string().nullable(),
  sources: z.array(z.object({ senderName: z.string().nullable(), sentAt: z.string(), text: z.string().nullable(), groupSubject: z.string() })),
});
export type AutoChangeItem = z.infer<typeof AutoChangeItem>;

// Unknown Courses and Possibly Missed messages join with #14.
export const ActivityItem = z.discriminatedUnion("type", [
  AutoChangeItem.extend({ type: z.literal("auto_change") }),
  z.object({ type: z.literal("event"), id: Id, kind: z.string(), payload: z.record(z.string(), z.unknown()), createdAt: z.string() }),
]);
export type ActivityItem = z.infer<typeof ActivityItem>;
export const ActivityPage = z.object({ items: z.array(ActivityItem), nextCursor: z.string().nullable() });
export const ActivityQuery = z.strictObject({ cursor: z.iso.datetime().optional() });
