import * as z from "zod";
import { Id } from "./common";

/** Stored by name; mapped to hex in one place (src/lib/course-colours.ts). */
export const COURSE_COLOURS = ["blue", "violet", "pink", "orange", "cyan", "olive", "slate"] as const;
export const CourseColour = z.enum(COURSE_COLOURS, { error: "Choose a colour" });

const code = z.string().trim().min(1, "Enter the Course code").max(20, "Use at most 20 characters");
const name = z.string().trim().min(1, "Enter the Course name").max(120, "Use at most 120 characters");
const lecturerName = z
  .string()
  .trim()
  .max(120, "Use at most 120 characters")
  .nullish()
  .transform((v) => v || null);

export const CourseCreate = z.strictObject({ semesterId: Id, code, name, lecturerName, colour: CourseColour });
export type CourseCreate = z.input<typeof CourseCreate>;
export const CourseUpdate = z.strictObject({ code, name, lecturerName, colour: CourseColour }).partial();
export type CourseUpdate = z.input<typeof CourseUpdate>;
export const CourseListQuery = z.strictObject({ semesterId: Id.optional() });
export const CourseDeleteQuery = z.strictObject({ confirmCode: z.string().default("") });

export const NicknameCreate = z.strictObject({
  nickname: z
    .string()
    .trim()
    .min(1, "Enter a nickname")
    .max(50, "Use at most 50 characters")
    .transform((n) => n.toLowerCase().replace(/\s+/g, " ")),
});
export type NicknameCreate = z.input<typeof NicknameCreate>;

export const Nickname = z.object({ id: Id, nickname: z.string() });
export type Nickname = z.infer<typeof Nickname>;

export const Course = z.object({
  id: Id,
  semesterId: Id,
  code: z.string(),
  name: z.string(),
  lecturerName: z.string().nullable(),
  colour: CourseColour,
  archivedAt: z.string().nullable(),
  nicknames: z.array(Nickname),
});
export type Course = z.infer<typeof Course>;
