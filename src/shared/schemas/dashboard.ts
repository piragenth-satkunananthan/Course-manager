import * as z from "zod";
import { Assignment } from "./assignment";
import { Exam } from "./exam";
import { Occurrence } from "./timetable";

export const Banner = z.object({ kind: z.enum(["whatsapp_disconnected", "worker_unhealthy", "auto_changes_paused", "ai_unavailable"]), since: z.string().nullable() });
export type Banner = z.infer<typeof Banner>;

export const Deadline = z.discriminatedUnion("type", [
  z.object({ type: z.literal("assignment"), item: Assignment }),
  z.object({ type: z.literal("exam"), item: Exam }),
]);
export type Deadline = z.infer<typeof Deadline>;

// highlightedChanges and recentAutoChanges stay empty until #12.
export const Dashboard = z.object({
  overdue: z.array(Deadline),
  todaySessions: z.array(Occurrence),
  upcoming: z.array(Deadline),
  tbaExams: z.array(Exam),
  highlightedChanges: z.array(z.unknown()),
  recentAutoChanges: z.array(z.unknown()),
  banners: z.array(Banner),
});
export type Dashboard = z.infer<typeof Dashboard>;
