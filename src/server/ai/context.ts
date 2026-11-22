// The context sent to the AI for one batch (design §9, file 64). buildContext is pure over a small adapter, so the
// worker passes Postgres and scripts/ai-eval.ts passes fixtures.
import { instantToLocal, APP_TIME_ZONE } from "@/server/domain/time";

export type AiContext = {
  now: string; // local Asia/Colombo date-time, "YYYY-MM-DD HH:mm"
  timeZone: typeof APP_TIME_ZONE;
  semester: { id: string; startDate: string; endDate: string } | null;
  // A Course Group also covers its Course's Practical Course (U13); buildContext fills practicalCourseId.
  linkedTo: { courseId: string; practicalCourseId?: string } | { semester: true };
  courses: { id: string; code: string; name: string; nicknames: string[]; practicalOf?: string }[];
  /**
   * Class occurrences for today and the next 21 days (#16): weekly ones by classSessionId and their original date
   * (`originalDate` when rescheduled), extras with no classSessionId; `sessionChangeId` names an existing change.
   */
  occurrences: {
    classSessionId: string | null; courseId: string; kind: "lecture" | "tutorial" | "lab"; date: string; start: string; end: string; location: string | null;
    status: "normal" | "cancelled" | "rescheduled" | "extra"; originalDate: string | null; sessionChangeId: string | null;
  }[];
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
  /** Today and the next 21 days, with Session Changes applied. */
  getOccurrences(): Promise<AiContext["occurrences"]>;
  /** Open Assignments and Exams, plus Assignments submitted in the last 30 days, so a repeat matches them. */
  getOpenAndRecentAssessments(): Promise<Pick<AiContext, "assignments" | "exams">>;
  getSuppressions(): Promise<AiContext["suppressions"]>;
  /** The group's last 7 days of earlier messages, at most 60. */
  getRecentMessages(): Promise<AiContext["recentMessages"]>;
};

export async function buildContext(adapter: ContextAdapter, batch: { now: Date; linkedTo: AiContext["linkedTo"]; messages: Msg[] }): Promise<AiContext> {
  const [semester, courses, occurrences, assessments, suppressions, recentMessages] = await Promise.all([
    adapter.getSemester(),
    adapter.getCourses(),
    adapter.getOccurrences(),
    adapter.getOpenAndRecentAssessments(),
    adapter.getSuppressions(),
    adapter.getRecentMessages(),
  ]);
  const local = instantToLocal(batch.now);
  const linked = batch.linkedTo;
  const practical = "courseId" in linked ? courses.find((c) => c.practicalOf === linked.courseId) : undefined;
  return {
    now: `${local.date} ${local.time}`,
    timeZone: APP_TIME_ZONE,
    semester,
    linkedTo: practical ? { ...linked, practicalCourseId: practical.id } : linked,
    courses,
    occurrences,
    ...assessments,
    suppressions,
    recentMessages: recentMessages.slice(-60),
    messages: batch.messages,
  };
}
