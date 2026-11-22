import { DeadlineList } from "@/components/app/deadline-list";
import type { ListKind } from "@/lib/deadline-list-href";
import { loadDeadlineList } from "@/server/data/deadline-list";
import { requireStudentId } from "@/server/session";

// Deadlines → Exams (design-system §7.3, #21): ?course=<id> is the filter.
export default async function ExamsPage({ searchParams }: { searchParams: Promise<{ course?: string }> }) {
  const kind: ListKind = "exams";
  const q = await searchParams;
  const data = await loadDeadlineList(await requireStudentId(), kind, q);
  return <DeadlineList kind={kind} {...data} />;
}
