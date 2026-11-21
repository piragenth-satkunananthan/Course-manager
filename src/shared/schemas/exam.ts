import * as z from "zod";
import { CourseColour } from "./course";
import { Id, IsoDate, optionalText, optionalTime, Version } from "./common";

const fields = {
  courseId: z.uuid({ error: "Choose a Course" }),
  title: z.string().trim().min(1, "Enter a title").max(200, "Use at most 200 characters"),
  kindLabel: optionalText(50),
  date: z.union([IsoDate, z.literal("")]).nullish().transform((v) => v || null), // null: TBA
  startTime: optionalTime,
  location: optionalText(200),
  topics: optionalText(2000),
};
const noTimeWithoutDate = (e: { date?: string | null; startTime?: string | null }) => !e.startTime || !!e.date;
const timeRule = { path: ["startTime"], message: "Add the date too, or leave the time empty while it's TBA" };

export const ExamCreate = z.strictObject(fields).refine(noTimeWithoutDate, timeRule);
export type ExamCreate = z.output<typeof ExamCreate>;
export const ExamUpdate = z.strictObject({ expectedVersion: Version, ...z.object(fields).partial().shape }).refine(
  (e) => !("startTime" in e && "date" in e) || noTimeWithoutDate(e),
  timeRule,
);
export type ExamUpdate = z.output<typeof ExamUpdate>;
export const ExamListQuery = z.strictObject({ courseId: Id.optional() });

export const Exam = z.object({
  id: Id,
  courseId: Id,
  courseCode: z.string(),
  courseColour: CourseColour,
  title: z.string(),
  kindLabel: z.string().nullable(),
  date: z.string().nullable(),
  startTime: z.string().nullable(),
  location: z.string().nullable(),
  topics: z.string().nullable(),
  dueAt: z.string().nullable(),
  source: z.enum(["manual", "ai"]),
  version: z.number().int(),
});
export type Exam = z.infer<typeof Exam>;
