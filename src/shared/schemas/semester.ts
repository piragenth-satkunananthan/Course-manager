import * as z from "zod";
import { Id, IsoDate } from "./common";

export const SemesterCreate = z
  .strictObject({
    name: z.string().trim().min(1, "Enter a name").max(100, "Use at most 100 characters"),
    startDate: IsoDate,
    endDate: IsoDate,
  })
  .refine((s) => s.endDate >= s.startDate, { path: ["endDate"], message: "The end date must be on or after the start date" });
export type SemesterCreate = z.infer<typeof SemesterCreate>;

export const Semester = z.object({
  id: Id,
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isCurrent: z.boolean(),
  archivedAt: z.string().nullable(),
  version: z.number().int(),
});
export type Semester = z.infer<typeof Semester>;
