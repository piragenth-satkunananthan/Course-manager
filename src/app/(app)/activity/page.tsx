import { Activity as ActivityIcon, CircleAlert, FileWarning, Hourglass, Mail, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { AutoChangeItem } from "@/components/app/auto-change-item";
import { PossiblyMissedItem, UnknownCourseItem } from "@/components/app/check-these-items";
import { EmptyState } from "@/components/app/empty-state";
import { Segmented } from "@/components/app/segmented";
import { listActivity } from "@/server/data/activity";
import { listCourseOptions, listCourses } from "@/server/data/courses";
import { listSemesters } from "@/server/data/semesters";
import { requireStudentId } from "@/server/session";
import { type ActivityFilter, ActivityQuery } from "@/shared/schemas/activity";

const n = (v: unknown) => (typeof v === "number" ? v : null);
/** Each event kind's sentence and icon (design §3 activity_event; #22). */
const EVENTS: Record<string, { text: (p: Record<string, unknown>) => string; icon: typeof CircleAlert }> = {
  ai_output_rejected: { text: () => "The AI couldn't read a batch of messages. They're flagged for you to check.", icon: TriangleAlert },
  ai_overflow: { text: (p) => `One batch asked for ${String(p.notApplied)} more changes than allowed; those weren't applied and are flagged.`, icon: TriangleAlert },
  change_kept: { text: (p) => `A message was deleted, but "${String(p.summary)}" was kept: ${String(p.reason).toLowerCase()}.`, icon: CircleAlert },
  alert: { text: (p) => `Alert emailed: ${String(p.cause).replaceAll("_", " ")}.`, icon: Mail },
  stuck_messages: { text: (p) => `${n(p.count) === null ? "Some messages" : `${n(p.count)} messages`} waited too long for the AI. They're retried, and flagged if they can't be read.`, icon: Hourglass },
  file_too_large: { text: (p) => `${p.fileName ? `"${String(p.fileName)}"` : "A file"} is over 20 MB, so it wasn't saved. Get it from the group.`, icon: FileWarning },
};
const FILTERS: { value: ActivityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "changes", label: "Changes" },
  { value: "attention", label: "Needs attention" },
];
const href = (filter: ActivityFilter, cursor?: string) => {
  const q = new URLSearchParams();
  if (filter !== "all") q.set("filter", filter);
  if (cursor) q.set("cursor", cursor);
  return `/activity${q.size ? `?${q}` : ""}`;
};
const EMPTY: Record<ActivityFilter, string> = {
  all: "Changes the AI makes from your WhatsApp groups will show here, each with Undo.",
  changes: "No Auto Changes yet. Changes the AI makes from your WhatsApp groups show here, each with Undo.",
  attention: "Nothing needs your attention. Possibly missed messages, Unknown Courses and problems show here.",
};

// The Activity Log (design-system §7.7): Auto Changes (with Undo batch), Possibly Missed messages, Unknown Courses and
// events, with filter chips (#22).
export default async function ActivityPage({ searchParams }: { searchParams: Promise<{ cursor?: string; filter?: string }> }) {
  const studentId = await requireStudentId();
  const q = ActivityQuery.safeParse(await searchParams);
  const filter: ActivityFilter = (q.success && q.data.filter) || "all";
  const [{ items, nextCursor }, options, semesters] = await Promise.all([listActivity(studentId, q.success ? q.data.cursor : undefined, filter), listCourseOptions(studentId), listSemesters(studentId)]);
  const current = semesters.find((s) => s.isCurrent && !s.archivedAt) ?? null;
  const data = { options, current, currentCourses: current ? await listCourses(studentId, { semesterId: current.id }) : [] };
  return (
    <>
      <h1 className="text-2xl font-bold md:text-display">Activity</h1>
      <div className="mt-4">
        <Segmented label="Show" value={filter} options={FILTERS.map((f) => ({ ...f, href: href(f.value) }))} />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={ActivityIcon}>{EMPTY[filter]}</EmptyState>
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
              <EventItem key={i.id} kind={i.kind} payload={i.payload} />
            ),
          )}
        </ul>
      )}
      {nextCursor && (
        <Link href={href(filter, nextCursor)} className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline md:min-h-10">
          Show older
        </Link>
      )}
    </>
  );
}

function EventItem({ kind, payload }: { kind: string; payload: Record<string, unknown> }) {
  const e = EVENTS[kind];
  const Icon = e?.icon ?? CircleAlert;
  return (
    <li className="flex items-start gap-2 rounded-md border border-border bg-card p-3 text-sm">
      <Icon size={20} strokeWidth={1.75} aria-hidden="true" className="shrink-0 text-warning" />
      {e ? e.text(payload) : kind.replaceAll("_", " ")}
    </li>
  );
}
