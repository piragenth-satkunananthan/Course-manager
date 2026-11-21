// The context sent to the AI for one batch (design §9, file 64). buildContext is pure over a small adapter, so the
// worker passes Postgres and scripts/ai-eval.ts passes fixtures. Timetable occurrences join with #16.
import { instantToLocal, APP_TIME_ZONE } from "@/server/domain/time";

export type AiContext = {
  now: string; // local Asia/Colombo date-time, "YYYY-MM-DD HH:mm"
  timeZone: typeof APP_TIME_ZONE;
  semester: { id: string; startDate: string; endDate: string } | null;
  linkedTo: { courseId: string } | { semester: true };
  courses: { id: string; code: string; name: string; nicknames: string[] }[];
  assignments: { id: string; courseId: string; title: string; dueDate: string; dueTime: string | null; status: string }[];
  exams: { id: string; courseId: string; title: string; kindLabel: string | null; date: string | null; startTime: string | null }[];
  suppressions: { courseId: string; entityType: "assignment" | "exam"; title: string; dueDate: string | null }[];
  recentMessages: { id: string; sender: string | null; sentAt: string; text: string; decision: string | null }[];
  messages: { id: string; sender: string | null; sentAt: string; kind: "text" | "edit"; text: string; editOf: { id: string; text: string } | null }[];
};

type Msg = AiContext["messages"][number];

export type ContextAdapter = {
  getSemester(): Promise<AiContext["semester"]>;
  getCourses(): Promise<AiContext["courses"]>;
  /** Open Assignments and Exams, plus Assignments submitted in the last 30 days, so a repeat matches them. */
  getOpenAndRecentAssessments(): Promise<Pick<AiContext, "assignments" | "exams">>;
  getSuppressions(): Promise<AiContext["suppressions"]>;
  /** The group's last 7 days of earlier messages, at most 60. */
  getRecentMessages(): Promise<AiContext["recentMessages"]>;
};

export async function buildContext(adapter: ContextAdapter, batch: { now: Date; linkedTo: AiContext["linkedTo"]; messages: Msg[] }): Promise<AiContext> {
  const [semester, courses, assessments, suppressions, recentMessages] = await Promise.all([
    adapter.getSemester(),
    adapter.getCourses(),
    adapter.getOpenAndRecentAssessments(),
    adapter.getSuppressions(),
    adapter.getRecentMessages(),
  ]);
  const local = instantToLocal(batch.now);
  return {
    now: `${local.date} ${local.time}`,
    timeZone: APP_TIME_ZONE,
    semester,
    linkedTo: batch.linkedTo,
    courses,
    ...assessments,
    suppressions,
    recentMessages: recentMessages.slice(-60),
    messages: batch.messages,
  };
}
