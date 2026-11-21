"use client";
// Add or edit an Assignment or an Exam (design-system §7.3). Edits send expectedVersion; on a conflict the form
// reloads the latest values with a toast (U7), and saving again uses the new version.
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type * as z from "zod";
import { apiFetch, type ApiError } from "@/lib/api-fetch";
import { Assignment, AssignmentCreate } from "@/shared/schemas/assignment";
import { Exam, ExamCreate } from "@/shared/schemas/exam";
import { applyServerError, CheckboxField, CourseField, type CourseOption, ErrorSummary, SaveButton, TextAreaField, TextField, useAppForm } from "./form";

const assignmentValues = (a?: Assignment): z.input<typeof AssignmentCreate> => ({
  courseId: a?.courseId ?? "", title: a?.title ?? "", dueDate: a?.dueDate ?? "", dueTime: a?.dueTime ?? "",
  submitWhere: a?.submitWhere ?? "", isGroupWork: a?.isGroupWork ?? false, description: a?.description ?? "",
});
const examValues = (e?: Exam): z.input<typeof ExamCreate> => ({
  courseId: e?.courseId ?? "", title: e?.title ?? "", kindLabel: e?.kindLabel ?? "", date: e?.date ?? "",
  startTime: e?.startTime ?? "", location: e?.location ?? "", topics: e?.topics ?? "",
});

/** Shared save flow: create, or update with the version we loaded; reload on CONFLICT. */
function useSave<Dto extends { id: string; version: number }>(path: string, schema: z.ZodType<Dto>, existing: Dto | undefined, reload: (current: Dto) => void) {
  const router = useRouter();
  const [version, setVersion] = useState(existing?.version);
  return async (body: object): Promise<{ ok: true; data: Dto } | { ok: false; error: ApiError | null }> => {
    const res = existing
      ? await apiFetch(`${path}/${existing.id}`, { method: "PATCH", body: { ...body, expectedVersion: version }, schema })
      : await apiFetch(path, { method: "POST", body, schema });
    if (res.ok) return res;
    if (res.error.code === "CONFLICT") {
      const current = schema.safeParse(res.error.current);
      if (current.success) {
        setVersion(current.data.version);
        reload(current.data);
        router.refresh(); // the list behind the form shows the latest values too
        toast.warning(res.error.message);
        return { ok: false, error: null };
      }
    }
    return res;
  };
}

type FormProps<Dto> = { courses: CourseOption[]; existing?: Dto; onDone: (saved: Dto) => void };

export function AssignmentForm({ courses, existing, onDone }: FormProps<Assignment>) {
  const form = useAppForm(AssignmentCreate, assignmentValues(existing));
  const save = useSave("/assignments", Assignment, existing, (a) => form.reset(assignmentValues(a)));
  const { isSubmitting, errors, submitCount } = form.formState;

  async function onSubmit(values: AssignmentCreate) {
    const res = await save(values);
    if (res.ok) return (toast.success("Saved"), onDone(res.data));
    if (res.error) applyServerError(form, res.error);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ courseId: "Course", title: "Title", dueDate: "Due date", dueTime: "Due time" }} />
      <CourseField control={form.control} name="courseId" courses={courses} />
      <TextField control={form.control} name="title" label="Title" required />
      <TextField control={form.control} name="dueDate" label="Due date" type="date" required />
      <TextField control={form.control} name="dueTime" label="Due time" type="time" help="Leave empty if no time was announced (treated as 23:59)" />
      <TextField control={form.control} name="submitWhere" label="Where to submit" help="For example LMS or the lab office" />
      <CheckboxField control={form.control} name="isGroupWork" label="Group work" />
      <TextAreaField control={form.control} name="description" label="Description" />
      <div className="flex justify-end">
        <SaveButton pending={isSubmitting} className="max-md:w-full">Save Assignment</SaveButton>
      </div>
    </form>
  );
}

export function ExamForm({ courses, existing, onDone }: FormProps<Exam>) {
  const form = useAppForm(ExamCreate, examValues(existing));
  const save = useSave("/exams", Exam, existing, (e) => form.reset(examValues(e)));
  const { isSubmitting, errors, submitCount } = form.formState;

  async function onSubmit(values: ExamCreate) {
    const res = await save(values);
    if (res.ok) return (toast.success("Saved"), onDone(res.data));
    if (res.error) applyServerError(form, res.error);
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ courseId: "Course", title: "Title", date: "Date", startTime: "Start time" }} />
      <CourseField control={form.control} name="courseId" courses={courses} />
      <TextField control={form.control} name="title" label="Title" required />
      <TextField control={form.control} name="kindLabel" label="Kind" help="Quiz, mid-term, viva, presentation…" />
      <TextField control={form.control} name="date" label="Date" type="date" help="Leave empty if TBA" />
      <TextField control={form.control} name="startTime" label="Start time" type="time" />
      <TextField control={form.control} name="location" label="Location" />
      <TextAreaField control={form.control} name="topics" label="Topics" />
      <div className="flex justify-end">
        <SaveButton pending={isSubmitting} className="max-md:w-full">Save Exam</SaveButton>
      </div>
    </form>
  );
}
