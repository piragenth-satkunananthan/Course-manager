"use client";
// One Deadline in a list (design-system §6.1), its detail sheet (§7.3), and the one-tap Submit checkbox.
import { FileText, GraduationCap } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RadioGroup as RadioPrimitive } from "radix-ui";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { COLOUR_BG } from "@/lib/course-colours";
import { dueLine, formatDate } from "@/lib/format";
import { Assignment, ASSIGNMENT_STATUSES } from "@/shared/schemas/assignment";
import type { Deadline } from "@/shared/schemas/dashboard";
import type { Exam } from "@/shared/schemas/exam";
import { AssignmentForm, ExamForm } from "./assessment-forms";
import type { CourseOption } from "./form";
import { ResponsiveDialog } from "./responsive-dialog";
import { StatusBadge, type StatusKind } from "./status-badge";

const STATUS_LABEL = { todo: "To do", in_progress: "In progress", submitted: "Submitted" } as const;

function whenLine(d: Deadline, today: string) {
  if (d.type === "assignment") return dueLine(d.item.dueDate, d.item.dueTime, today);
  return d.item.date ? dueLine(d.item.date, d.item.startTime, today, "On", "time TBA") : "Date TBA";
}

function badgeFor(d: Deadline, overdue: boolean, today: string, tomorrow: string): StatusKind | null {
  if (d.type === "exam") return d.item.date ? null : "tba";
  if (d.item.status === "submitted") return "submitted";
  if (overdue) return "overdue";
  return d.item.dueDate === today ? "dueToday" : d.item.dueDate === tomorrow ? "dueTomorrow" : null;
}

type Props = { deadline: Deadline; overdue?: boolean; today: string; tomorrow: string; courses: CourseOption[] };

export function DeadlineItem({ deadline: d, overdue = false, today, tomorrow, courses }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const badge = badgeFor(d, overdue, today, tomorrow);
  const submitted = d.type === "assignment" && d.item.status === "submitted";

  async function toggleSubmitted(checked: boolean) {
    const res = await apiFetch(`/assignments/${d.item.id}/status`, { method: "PUT", body: { status: checked ? "submitted" : "todo" }, schema: Assignment });
    if (!res.ok) return toastApiError(res.error);
    toast.success(checked ? `Marked ${d.item.title} submitted` : `${d.item.title} is to do again`);
    router.refresh();
  }

  return (
    <li className="flex min-h-14 items-stretch gap-2 rounded-md border border-border bg-card">
      <span aria-hidden="true" className={`w-1 shrink-0 rounded-l-md ${COLOUR_BG[d.item.courseColour]}`} />
      <button type="button" onClick={() => setOpen(true)} className="min-w-0 flex-1 py-2 text-left">
        <span className="flex items-center gap-1 text-sm text-muted-foreground">
          {d.type === "assignment" ? <FileText size={16} aria-hidden="true" /> : <GraduationCap size={16} aria-hidden="true" />}
          {d.item.courseCode} · {d.type === "assignment" ? "Assignment" : "Exam"}
        </span>
        <span className={`block font-semibold ${submitted ? "text-muted-foreground" : ""}`}>{d.item.title}</span>
        <span className="block text-sm text-muted-foreground tabular-nums">{whenLine(d, today)}</span>
        {badge && <span className="mt-1 block"><StatusBadge kind={badge} /></span>}
      </button>
      {d.type === "assignment" && (
        <label className="flex w-11 shrink-0 items-center justify-center" title="Mark submitted">
          <Checkbox checked={submitted} onCheckedChange={(v) => toggleSubmitted(v === true)} aria-label={`Mark ${d.item.title} submitted`} />
        </label>
      )}
      <DeadlineDetail deadline={d} open={open} onOpenChange={setOpen} today={today} courses={courses} />
    </li>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return value ? (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd>{value}</dd>
    </div>
  ) : null;
}

function DeadlineDetail({ deadline: d, open, onOpenChange, today, courses }: { deadline: Deadline; open: boolean; onOpenChange: (o: boolean) => void; today: string; courses: CourseOption[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const kind = d.type === "assignment" ? "Assignment" : "Exam";
  const path = d.type === "assignment" ? "assignments" : "exams";
  const close = () => (onOpenChange(false), setEditing(false));

  async function setStatus(status: Assignment["status"]) {
    const res = await apiFetch(`/assignments/${d.item.id}/status`, { method: "PUT", body: { status }, schema: Assignment });
    if (!res.ok) return toastApiError(res.error);
    toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
    router.refresh();
  }

  async function remove() {
    const res = await apiFetch(`/${path}/${d.item.id}?expectedVersion=${d.item.version}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      toastApiError(res.error);
      return router.refresh(); // a conflict means it changed: show the latest
    }
    toast.success(`Deleted ${d.item.title}`);
    close();
    router.refresh();
  }

  return (
    <>
      <ResponsiveDialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())} title={editing ? `Edit ${kind}` : d.item.title} description={`${d.item.courseCode} · ${kind}`}>
        {editing ? (
          d.type === "assignment" ? (
            <AssignmentForm courses={courses} existing={d.item} onDone={() => (close(), router.refresh())} />
          ) : (
            <ExamForm courses={courses} existing={d.item as Exam} onDone={() => (close(), router.refresh())} />
          )
        ) : (
          <div className="space-y-4 pb-4">
            <dl className="space-y-3">
              <Row label="When" value={whenLine(d, today)} />
              {d.type === "assignment" ? (
                <>
                  <Row label="Where to submit" value={d.item.submitWhere} />
                  <Row label="Group work" value={d.item.isGroupWork ? "Yes" : null} />
                  <Row label="Description" value={d.item.description} />
                  <Row label="Submitted" value={d.item.submittedAt && formatDate(d.item.submittedAt.slice(0, 10))} />
                </>
              ) : (
                <>
                  <Row label="Kind" value={d.item.kindLabel} />
                  <Row label="Location" value={d.item.location} />
                  <Row label="Topics" value={d.item.topics} />
                </>
              )}
              <Row label="Source" value={d.item.source === "manual" ? "Added by you" : "From WhatsApp"} />
            </dl>
            {d.type === "assignment" && (
              <div>
                <p id={`status-${d.item.id}`} className="text-sm font-medium">Status</p>
                <RadioPrimitive.Root
                  aria-labelledby={`status-${d.item.id}`}
                  value={d.item.status}
                  onValueChange={(v) => setStatus(v as Assignment["status"])}
                  className="mt-1 grid grid-cols-3 rounded-md border border-input p-1"
                >
                  {ASSIGNMENT_STATUSES.map((s) => (
                    <RadioPrimitive.Item
                      key={s}
                      value={s}
                      className="min-h-11 rounded-sm px-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:bg-primary-subtle data-[state=checked]:text-primary md:min-h-10"
                    >
                      {STATUS_LABEL[s]}
                    </RadioPrimitive.Item>
                  ))}
                </RadioPrimitive.Root>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDeleting(true)}>Delete</Button>
              <Button onClick={() => setEditing(true)}>Edit</Button>
            </div>
          </div>
        )}
      </ResponsiveDialog>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {d.item.title}?</AlertDialogTitle>
            <AlertDialogDescription>Its reminders stop. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={remove}>Delete {kind}</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
