import { Activity as ActivityIcon, CircleAlert } from "lucide-react";
import Link from "next/link";
import { AutoChangeItem } from "@/components/app/auto-change-item";
import { PossiblyMissedItem, UnknownCourseItem } from "@/components/app/check-these-items";
import { EmptyState } from "@/components/app/empty-state";
import { listActivity } from "@/server/data/activity";
import { listCourseOptions, listCourses } from "@/server/data/courses";
import { listSemesters } from "@/server/data/semesters";
import { requireStudentId } from "@/server/session";
import { ActivityQuery } from "@/shared/schemas/activity";

const EVENT_TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  ai_output_rejected: () => "The AI couldn't read a batch of messages. They're flagged for you to check.",
  ai_overflow: (p) => `One batch asked for ${String(p.notApplied)} more changes than allowed; those weren't applied.`,
  change_kept: (p) => `A message was deleted, but "${String(p.summary)}" was kept: ${String(p.reason).toLowerCase()}.`,
  alert: (p) => `Alert emailed: ${String(p.cause).replaceAll("_", " ")}.`,
};

// The Activity Log (design-system §7.7): Auto Changes, Possibly Missed messages, Unknown Courses (#14) and events.
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const studentId = await requireStudentId();
  const q = ActivityQuery.safeParse(await searchParams);
  const [{ items, nextCursor }, options, semesters] = await Promise.all([listActivity(studentId, q.success ? q.data.cursor : undefined), listCourseOptions(studentId), listSemesters(studentId)]);
  const current = semesters.find((s) => s.isCurrent && !s.archivedAt) ?? null;
  const data = { options, current, currentCourses: current ? await listCourses(studentId, { semesterId: current.id }) : [] };
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Activity</h1>
      {items.length === 0 ? (
        <EmptyState icon={ActivityIcon}>Changes the AI makes from your WhatsApp groups will show here, each with Undo.</EmptyState>
      ) : (
        <ul className="mt-4 space-y-2" aria-label="Activity">
          {items.map((i) =>
            i.type === "auto_change" ? (
              <AutoChangeItem key={i.id} item={i} />
            ) : i.type === "possibly_missed" ? (
              <PossiblyMissedItem key={i.inboxMessageId} item={i} data={data} />
            ) : i.type === "unknown_course" ? (
              <UnknownCourseItem key={i.id} item={i} data={data} />
            ) : (
              <li key={i.id} className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
                <CircleAlert size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-warning" />
                {(EVENT_TEXT[i.kind] ?? (() => i.kind))(i.payload)}
              </li>
            ),
          )}
        </ul>
      )}
      {nextCursor && (
        <Link href={`/activity?cursor=${encodeURIComponent(nextCursor)}`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline md:min-h-10">
          Show older
        </Link>
      )}
    </>
  );
}
