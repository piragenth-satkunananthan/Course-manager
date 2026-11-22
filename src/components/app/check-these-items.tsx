"use client";
// Possibly Missed messages and Unknown Courses in the Activity Log (design-system §6.5, #14).
import { CircleHelp, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import * as z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { type PossiblyMissedItem as Missed, ResolveResult, type UnknownCourseItem as Unknown, type UnknownCourseResolve } from "@/shared/schemas/activity";
import type { Course } from "@/shared/schemas/course";
import type { Semester } from "@/shared/schemas/semester";
import { AssignmentForm, ExamForm } from "./assessment-forms";
import { SourceMessage } from "./auto-change-item";
import { CourseForm } from "./course-form";
import { CourseField, type CourseOption, ErrorSummary, SaveButton, useAppForm } from "./form";
import { ResponsiveDialog } from "./responsive-dialog";

/** What the Add forms need: Course options, and the current Semester with its Courses for a new Course. */
export type FormData = { options: CourseOption[]; current: Semester | null; currentCourses: Course[] };

const NO_PRACTICAL = /has no Practical Course/i;

export function PossiblyMissedItem({ item, data }: { item: Missed; data: FormData }) {
  const router = useRouter();
  const [adding, setAdding] = useState<"assignment" | "exam" | "course" | null>(null);
  const [pending, setPending] = useState(false);
  // The group's Course, if it can still take Assessments.
  const courseId = item.courseId && data.options.some((c) => c.id === item.courseId) ? item.courseId : "";

  async function dismiss(quiet = false) {
    setPending(true);
    const res = await apiFetch(`/possibly-missed/${item.inboxMessageId}/dismiss`, { method: "POST" });
    setPending(false);
    if (!res.ok && !quiet) toastApiError(res.error);
    else if (!quiet) toast.success("Dismissed");
    router.refresh();
  }
  // Adding from the message handles it: it leaves the list.
  const added = () => (setAdding(null), void dismiss(true));

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <p className="flex items-start gap-2 font-semibold">
        <CircleHelp size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
        Possibly missed
      </p>
      {item.reason && <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>}
      <SourceMessage message={item} />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {item.reason && NO_PRACTICAL.test(item.reason) && item.courseId && data.current && (
          <Button variant="outline" onClick={() => setAdding("course")}>Add Practical Course</Button>
        )}
        <Button variant="outline" onClick={() => setAdding("assignment")}>Add Assignment</Button>
        <Button variant="outline" onClick={() => setAdding("exam")}>Add Exam</Button>
        <Button variant="ghost" onClick={() => dismiss()} disabled={pending}>Dismiss</Button>
      </div>
      <ResponsiveDialog open={adding === "assignment"} onOpenChange={(o) => !o && setAdding(null)} title="New Assignment">
        <AssignmentForm courses={data.options} initial={{ courseId, description: item.text ?? "" }} onDone={added} />
      </ResponsiveDialog>
      <ResponsiveDialog open={adding === "exam"} onOpenChange={(o) => !o && setAdding(null)} title="New Exam">
        <ExamForm courses={data.options} initial={{ courseId }} onDone={added} />
      </ResponsiveDialog>
      {data.current && (
        <ResponsiveDialog open={adding === "course"} onOpenChange={(o) => !o && setAdding(null)} title="New Practical Course">
          <CourseForm semesters={[data.current]} defaultSemesterId={data.current.id} semesterCourses={data.currentCourses} initial={{ practicalOfCourseId: item.courseId }} onDone={added} />
        </ResponsiveDialog>
      )}
    </li>
  );
}

const STATUS_TEXT = { added: "Added as a Course", mapped: "Linked to a Course", ignored: "Ignored" } as const;
const NicknameOf = z.object({ courseId: z.uuid({ error: "Choose a Course" }) });

export function UnknownCourseItem({ item, data }: { item: Unknown; data: FormData }) {
  const router = useRouter();
  const [open, setOpen] = useState<"add" | "nickname" | null>(null);
  const [pending, setPending] = useState(false);
  const form = useAppForm(NicknameOf, { courseId: "" });
  const current = data.currentCourses.filter((c) => !c.archivedAt).map((c) => ({ id: c.id, code: c.code, name: c.name, colour: c.colour }));

  const resolve = (body: UnknownCourseResolve) => apiFetch(`/unknown-courses/${item.id}/resolve`, { method: "POST", body, schema: ResolveResult });
  function finish(r: ResolveResult) {
    const missed = r.possiblyMissed ? ` ${r.possiblyMissed} flagged to check.` : "";
    toast.success(`${r.applied} ${r.applied === 1 ? "change" : "changes"} applied.${missed}`);
    setOpen(null);
    router.refresh();
  }
  async function ignore() {
    setPending(true);
    const res = await resolve({ action: "ignore" });
    setPending(false);
    if (!res.ok) return toastApiError(res.error);
    toast.success(`"${item.name}" will be ignored`);
    router.refresh();
  }

  return (
    <li className="rounded-md border border-border bg-card p-3">
      <p className="flex items-start gap-2 font-semibold">
        <CircleHelp size={20} strokeWidth={1.75} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
        Unknown Course: {item.name}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {item.operations} {item.operations === 1 ? "change" : "changes"} waiting
        {item.status !== "open" && <Badge variant="secondary" className="text-muted-foreground"><CircleCheck aria-hidden="true" />{STATUS_TEXT[item.status]}</Badge>}
      </div>
      {item.firstMessage && <SourceMessage message={item.firstMessage} />}
      {item.status === "open" && (
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          {data.current && <Button variant="outline" onClick={() => setOpen("add")}>Add course</Button>}
          {current.length > 0 && <Button variant="outline" onClick={() => setOpen("nickname")}>Nickname of…</Button>}
          <Button variant="ghost" onClick={ignore} disabled={pending}>Ignore</Button>
        </div>
      )}
      {data.current && (
        <ResponsiveDialog open={open === "add"} onOpenChange={(o) => !o && setOpen(null)} title={`Add "${item.name}" as a Course`}>
          <CourseForm
            semesters={[data.current]}
            defaultSemesterId={data.current.id}
            semesterCourses={data.currentCourses}
            initial={{ code: item.name, name: item.name }}
            save={async ({ code, name, lecturerName, colour, practicalOfCourseId }) => {
              const res = await resolve({ action: "add", code, name, lecturerName, colour, practicalOfCourseId });
              if (!res.ok) return res;
              finish(res.data);
              return { ok: true, data: res.data.course! };
            }}
            onDone={() => undefined}
          />
        </ResponsiveDialog>
      )}
      <ResponsiveDialog open={open === "nickname"} onOpenChange={(o) => !o && setOpen(null)} title={`Which Course is "${item.name}"?`}>
        <form
          noValidate
          className="space-y-4 pb-4"
          onSubmit={form.handleSubmit(async ({ courseId }) => {
            const res = await resolve({ action: "nickname", courseId });
            if (!res.ok) return toastApiError(res.error);
            finish(res.data);
          })}
        >
          <ErrorSummary errors={form.formState.errors} submitCount={form.formState.submitCount} labels={{ courseId: "Course" }} />
          <CourseField control={form.control} name="courseId" courses={current} />
          <p className="text-sm text-muted-foreground">&ldquo;{item.name}&rdquo; becomes a Nickname of that Course, so the next message using it is understood.</p>
          <div className="flex justify-end">
            <SaveButton pending={form.formState.isSubmitting} className="max-md:w-full">Save</SaveButton>
          </div>
        </form>
      </ResponsiveDialog>
    </li>
  );
}
