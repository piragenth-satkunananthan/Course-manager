import { DeadlineList } from "@/components/app/deadline-list";
import type { ListKind } from "@/lib/deadline-list-href";
import { loadDeadlineList } from "@/server/data/deadline-list";
import { requireStudentId } from "@/server/session";

// Deadlines → Assignments (design-system §7.3, #21): ?status=submitted and ?course=<id> are the filters.
export default async function AssignmentsPage({ searchParams }: { searchParams: Promise<{ status?: string; course?: string }> }) {
  const kind: ListKind = "assignments";
  const q = await searchParams;
  const data = await loadDeadlineList(await requireStudentId(), kind, q);
  return <DeadlineList kind={kind} {...data} />;
}
