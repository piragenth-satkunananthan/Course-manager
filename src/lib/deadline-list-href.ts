// The Deadlines lists' URLs (#21): kind, status and Course filters. Shared by the pages, the data and the filters.
export type ListKind = "assignments" | "exams";
export type ListStatus = "todo" | "submitted";

/** The list's URL with these filters; the defaults (To do, all Courses) are left out. */
export const listHref = (kind: ListKind, f: { status?: ListStatus; course?: string | null }) => {
  const q = new URLSearchParams();
  if (kind === "assignments" && f.status === "submitted") q.set("status", "submitted");
  if (f.course) q.set("course", f.course);
  return `/${kind}${q.size ? `?${q}` : ""}`;
};
