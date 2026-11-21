"use client";
// The Course page's weekly Class Sessions: add, edit, delete (design-system §7.2).
import { FlaskConical, Plus, Presentation, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type * as z from "zod";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { SESSION_KIND_LABEL, WEEKDAYS } from "@/lib/format";
import { ClassSession, ClassSessionCreate, SESSION_KINDS } from "@/shared/schemas/timetable";
import { applyServerError, ErrorSummary, SaveButton, SelectField, TextField, useAppForm } from "./form";
import { ResponsiveDialog } from "./responsive-dialog";

export const KIND_ICON = { lecture: Presentation, tutorial: Users, lab: FlaskConical } as const;
const kindOptions = SESSION_KINDS.map((k) => ({ value: k, label: SESSION_KIND_LABEL[k] }));
const dayOptions = WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d }));

function ClassSessionForm({ courseId, existing, onDone }: { courseId: string; existing?: ClassSession; onDone: () => void }) {
  const form = useAppForm(ClassSessionCreate, {
    kind: existing?.kind, weekday: existing ? String(existing.weekday) : undefined,
    startTime: existing?.startTime ?? "", endTime: existing?.endTime ?? "", location: existing?.location ?? "",
  } as z.input<typeof ClassSessionCreate>);
  const { isSubmitting, errors, submitCount } = form.formState;
  async function onSubmit(values: ClassSessionCreate) {
    const res = existing
      ? await apiFetch(`/class-sessions/${existing.id}`, { method: "PATCH", body: values, schema: ClassSession })
      : await apiFetch(`/courses/${courseId}/class-sessions`, { method: "POST", body: values, schema: ClassSession });
    if (!res.ok) return applyServerError(form, res.error);
    toast.success("Saved");
    onDone();
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ kind: "Kind", weekday: "Day", startTime: "Start", endTime: "End" }} />
      <SelectField control={form.control} name="kind" label="Kind" options={kindOptions} required />
      <SelectField control={form.control} name="weekday" label="Day" options={dayOptions} required />
      <TextField control={form.control} name="startTime" label="Start" type="time" required />
      <TextField control={form.control} name="endTime" label="End" type="time" required />
      <TextField control={form.control} name="location" label="Location" help="For example Hall B2" />
      <div className="flex justify-end">
        <SaveButton pending={isSubmitting} className="max-md:w-full">Save class</SaveButton>
      </div>
    </form>
  );
}

export function WeeklyClasses({ courseId, code, sessions }: { courseId: string; code: string; sessions: ClassSession[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<ClassSession | "new" | null>(null);
  const [deleting, setDeleting] = useState<ClassSession | null>(null);
  const done = () => (setEditing(null), router.refresh());
  const describe = (s: ClassSession) => `${WEEKDAYS[s.weekday - 1]} ${s.startTime}–${s.endTime} ${SESSION_KIND_LABEL[s.kind]}`;

  async function remove() {
    const s = deleting!;
    const res = await apiFetch(`/class-sessions/${s.id}`, { method: "DELETE" });
    setDeleting(null);
    if (!res.ok) return toastApiError(res.error);
    toast.success(`Deleted ${describe(s)}`);
    router.refresh();
  }

  return (
    <section aria-labelledby="classes-heading" className="rounded-md border border-border bg-card p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 id="classes-heading" className="text-title font-semibold">Weekly classes</h2>
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          Add class
        </Button>
      </div>
      {sessions.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No weekly classes yet. Add each Lecture, Tutorial and Lab once; they repeat every week of the Semester.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border" aria-label={`${code} weekly classes`}>
          {sessions.map((s) => {
            const Icon = KIND_ICON[s.kind];
            return (
              <li key={s.id} className="flex min-h-14 items-center gap-3 py-2">
                <Icon size={20} strokeWidth={1.75} aria-hidden="true" className="text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold tabular-nums">{describe(s)}</span>
                  {s.location && <span className="block text-sm text-muted-foreground">{s.location}</span>}
                </span>
                <Button variant="ghost" onClick={() => setEditing(s)} aria-label={`Edit ${describe(s)}`}>Edit</Button>
                <Button variant="ghost" onClick={() => setDeleting(s)} aria-label={`Delete ${describe(s)}`}>Delete</Button>
              </li>
            );
          })}
        </ul>
      )}
      <ResponsiveDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} title={editing === "new" ? "Add weekly class" : "Edit weekly class"}>
        {editing && <ClassSessionForm courseId={courseId} existing={editing === "new" ? undefined : editing} onDone={done} />}
      </ResponsiveDialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting && describe(deleting)}?</AlertDialogTitle>
            <AlertDialogDescription>Every week of it leaves the timetable, with any changes to single classes. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={remove}>Delete class</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
