import * as z from "zod";
import { CourseColour } from "./course";
import { Id, IsoDate, optionalText, optionalTime, Version } from "./common";

export const ASSIGNMENT_STATUSES = ["todo", "in_progress", "submitted"] as const;
export const AssignmentStatus = z.enum(ASSIGNMENT_STATUSES);

const fields = {
  courseId: z.uuid({ error: "Choose a Course" }),
  title: z.string().trim().min(1, "Enter a title").max(200, "Use at most 200 characters"),
  dueDate: IsoDate,
  dueTime: optionalTime,
  description: optionalText(2000),
  submitWhere: optionalText(200),
  isGroupWork: z.boolean().default(false),
};

export const AssignmentCreate = z.strictObject(fields);
export type AssignmentCreate = z.output<typeof AssignmentCreate>;
export const AssignmentUpdate = z.strictObject({ expectedVersion: Version, ...z.object(fields).partial().shape, isGroupWork: z.boolean().optional() });
export type AssignmentUpdate = z.output<typeof AssignmentUpdate>;
export const AssignmentStatusPut = z.strictObject({ status: AssignmentStatus });
export const AssignmentListQuery = z.strictObject({ courseId: Id.optional(), status: AssignmentStatus.optional(), from: IsoDate.optional(), to: IsoDate.optional() });

export const Assignment = z.object({
  id: Id,
  courseId: Id,
  courseCode: z.string(),
  courseColour: CourseColour,
  title: z.string(),
  description: z.string().nullable(),
  dueDate: z.string(),
  dueTime: z.string().nullable(),
  timeAnnounced: z.boolean(),
  dueAt: z.string(),
  status: AssignmentStatus,
  submittedAt: z.string().nullable(),
  submitWhere: z.string().nullable(),
  isGroupWork: z.boolean(),
  source: z.enum(["manual", "ai"]),
  version: z.number().int(),
});
export type Assignment = z.infer<typeof Assignment>;
