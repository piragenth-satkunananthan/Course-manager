import * as z from "zod";
import { Assignment } from "./assignment";
import { Exam } from "./exam";
import { Occurrence } from "./timetable";

export const Deadline = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assignment"), item: Assignment }),
  z.object({ type: z.literal("exam"), item: Exam }),
]);
export type Deadline = z.infer<typeof Deadline>;

// highlightedChanges and recentAutoChanges (#12) and banners (#10, #11) stay empty until their tickets.
export const Dashboard = z.object({
  overdue: z.array(Deadline),
  todaySessions: z.array(Occurrence),
  upcoming: z.array(Deadline),
  tbaExams: z.array(Exam),
  highlightedChanges: z.array(z.unknown()),
  recentAutoChanges: z.array(z.unknown()),
  banners: z.array(z.unknown()),
});
export type Dashboard = z.infer<typeof Dashboard>;
