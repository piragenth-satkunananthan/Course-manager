"use client";
// One class on one day (design-system §6.2) and its sheet (§7.4): cancel, reschedule, or edit or remove a change.
import { ArrowRightLeft, Ban, CircleDot, CirclePlus, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import type * as z from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiFetch, type ApiError, toastApiError } from "@/lib/api-fetch";
import { COLOUR_BG } from "@/lib/course-colours";
import { formatDate, SESSION_KIND_LABEL } from "@/lib/format";
import { ExtraForm, type Occurrence, RescheduleForm, SESSION_KINDS, SessionChange } from "@/shared/schemas/timetable";
import { applyServerError, CourseField, type CourseOption, ErrorSummary, SaveButton, SelectField, TextField, useAppForm } from "./form";
import { ResponsiveDialog } from "./responsive-dialog";
import { KIND_ICON } from "./weekly-classes";

const title = (o: Occurrence) => `${o.courseCode} ${SESSION_KIND_LABEL[o.kind]}`;

/**
 * Saves a change for this class. With no change yet it creates one; if another arrived meanwhile (409 with
 * existingId), it edits that one instead (AC: "the UI edits the existing change"). An existing change is PATCHed.
 */
async function saveChange(o: Occurrence, body: Record<string, unknown>): Promise<{ ok: true } | { ok: false; error: ApiError }> {
  const patch = (id: string, version: number) => apiFetch(`/session-changes/${id}`, { method: "PATCH", body: { ...body, expectedVersion: version }, schema: SessionChange });
  let res = o.sessionChangeId
    ? await patch(o.sessionChangeId, o.sessionChangeVersion!)
    : await apiFetch("/session-changes", { method: "POST", body: { ...body, classSessionId: o.classSessionId, date: o.date }, schema: SessionChange });
  if (!res.ok && res.error.existingId) {
    const current = SessionChange.safeParse(res.error.current);
    if (current.success) res = await patch(res.error.existingId, current.data.version);
  }
  return res.ok ? { ok: true } : res;
}

function RescheduleChangeForm({ o, onDone }: { o: Occurrence; onDone: () => void }) {
  const form = useAppForm(RescheduleForm, { newDate: o.date, newStart: o.startTime, newEnd: o.endTime, newLocation: o.location ?? "" });
  const { isSubmitting, errors, submitCount } = form.formState;
  async function onSubmit(v: RescheduleForm) {
    const res = await saveChange(o, { kind: o.status === "extra" ? "extra" : "reschedule", ...v });
    if (!res.ok) return applyServerError(form, res.error);
    toast.success("Saved");
    onDone();
  }
  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ newDate: "Date", newStart: "Start", newEnd: "End" }} />
      <TextField control={form.control} name="newDate" label="Date" type="date" required />
      <TextField control={form.control} name="newStart" label="Start" type="time" required />
      <TextField control={form.control} name="newEnd" label="End" type="time" required />
      <TextField control={form.control} name="newLocation" label="Location" />
      <div className="flex justify-end">
        <SaveButton pending={isSubmitting} className="max-md:w-full">Save</SaveButton>
      </div>
    </form>
  );
}

/** A class's sheet (design-system §7.4): its time and place, and the actions that fit its state. */
export function OccurrenceSheet({ o, open, onOpenChange }: { o: Occurrence; open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [pending, setPending] = useState(false);
  const close = () => (onOpenChange(false), setMode("view"));
  const refresh = () => (close(), router.refresh());

  async function run(action: () => Promise<{ ok: true } | { ok: false; error: ApiError }>, done: string) {
    setPending(true);
    const res = await action();
    setPending(false);
    if (!res.ok) {
      toastApiError(res.error);
      return refresh(); // a conflict means it changed: show the latest
    }
    toast.success(done);
    refresh();
  }
  const cancel = () => run(() => saveChange(o, { kind: "cancel" }), `${title(o)} cancelled on ${formatDate(o.date)}`);
  const removeChange = (done: string) =>
    run(async () => {
      const res = await apiFetch(`/session-changes/${o.sessionChangeId}?expectedVersion=${o.sessionChangeVersion}`, { method: "DELETE" });
      return res.ok ? { ok: true as const } : res;
    }, done);

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(v) => (v ? onOpenChange(true) : close())}
      title={mode === "reschedule" ? `Reschedule ${title(o)}` : title(o)}
      description={`${formatDate(o.date)}, ${o.startTime}–${o.endTime}${o.location ? ` · ${o.location}` : ""}`}
    >
      {mode === "reschedule" ? (
        <RescheduleChangeForm o={o} onDone={refresh} />
      ) : (
        <div className="flex flex-col gap-2 pb-4 md:flex-row md:flex-wrap md:justify-end">
          {o.status === "normal" && (
            <>
              <Button variant="outline" disabled={pending} onClick={cancel}>Cancel this class</Button>
              <Button variant="outline" onClick={() => setMode("reschedule")}>Reschedule</Button>
            </>
          )}
          {o.status === "cancelled" && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => removeChange(`${title(o)} is back on`)}>Restore class</Button>
              <Button variant="outline" onClick={() => setMode("reschedule")}>Reschedule instead</Button>
            </>
          )}
          {o.status === "rescheduled" && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => removeChange(`${title(o)} is back at its usual time`)}>Restore usual time</Button>
              <Button variant="outline" onClick={() => setMode("reschedule")}>Change new time</Button>
            </>
          )}
          {o.status === "extra" && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => removeChange("Extra session removed")}>Remove extra session</Button>
              <Button variant="outline" onClick={() => setMode("reschedule")}>Edit</Button>
            </>
          )}
          {o.classSessionId && (
            <Button asChild variant="ghost">
              <Link href={`/courses/${o.courseId}`}>Edit weekly class</Link>
            </Button>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}

export function SessionItem({ o, now }: { o: Occurrence; now: boolean }) {
  const [open, setOpen] = useState(false);
  const Icon = KIND_ICON[o.kind];
  return (
    <li className="flex min-h-14 items-stretch rounded-md border border-border bg-card">
      <button type="button" onClick={() => setOpen(true)} className="flex min-w-0 flex-1 items-stretch gap-3 py-2 pr-2 pl-3 text-left">
        <span className="w-12 shrink-0 text-sm tabular-nums">
          <span className="block font-semibold">{o.startTime}</span>
          <span className="block text-muted-foreground">{o.endTime}</span>
        </span>
        <span aria-hidden="true" className={`w-1 shrink-0 rounded-full ${COLOUR_BG[o.colour]}`} />
        <span className="min-w-0 flex-1">
          <span className={`flex items-center gap-1 font-semibold ${o.status === "cancelled" ? "text-muted-foreground line-through" : ""}`}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            {title(o)}
          </span>
          {o.location && <span className="block text-sm text-muted-foreground">{o.location}</span>}
          <span className="mt-1 flex flex-wrap gap-1">
            {now && (
              <Badge className="bg-primary text-primary-foreground"><CircleDot aria-hidden="true" />Now</Badge>
            )}
            {o.status === "cancelled" && (
              <Badge className="bg-muted text-muted-foreground"><Ban aria-hidden="true" />Cancelled</Badge>
            )}
            {o.status === "rescheduled" && (
              <Badge className="bg-warning-subtle text-warning">
                <ArrowRightLeft aria-hidden="true" />
                Moved from {o.originalDate === o.date ? "" : `${formatDate(o.originalDate!)}, `}{o.originalStartTime}
              </Badge>
            )}
            {o.status === "extra" && (
              <Badge className="bg-primary-subtle text-primary"><CirclePlus aria-hidden="true" />Extra session</Badge>
            )}
          </span>
        </span>
      </button>
      <OccurrenceSheet o={o} open={open} onOpenChange={setOpen} />
    </li>
  );
}

export function AddExtraClass({ courses, date }: { courses: CourseOption[]; date: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const form = useAppForm(ExtraForm, { courseId: "", date, start: "", end: "", location: "" } as Partial<z.input<typeof ExtraForm>> as z.input<typeof ExtraForm>);
  const { isSubmitting, errors, submitCount } = form.formState;
  async function onSubmit(v: ExtraForm) {
    const res = await apiFetch("/session-changes", { method: "POST", body: { kind: "extra", ...v }, schema: SessionChange });
    if (!res.ok) return applyServerError(form, res.error);
    toast.success("Saved");
    setOpen(false);
    form.reset();
    router.refresh();
  }
  return (
    <>
      <Button variant="outline" onClick={() => (form.reset({ ...form.getValues(), date }), setOpen(true))}>
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        Add extra class
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Add extra class">
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
          <ErrorSummary errors={errors} submitCount={submitCount} labels={{ courseId: "Course", sessionKind: "Kind", date: "Date", start: "Start", end: "End" }} />
          <CourseField control={form.control} name="courseId" courses={courses} />
          <SelectField control={form.control} name="sessionKind" label="Kind" required options={SESSION_KINDS.map((k) => ({ value: k, label: SESSION_KIND_LABEL[k] }))} />
          <TextField control={form.control} name="date" label="Date" type="date" required />
          <TextField control={form.control} name="start" label="Start" type="time" required />
          <TextField control={form.control} name="end" label="End" type="time" required />
          <TextField control={form.control} name="location" label="Location" />
          <div className="flex justify-end">
            <SaveButton pending={isSubmitting} className="max-md:w-full">Add extra class</SaveButton>
          </div>
        </form>
      </ResponsiveDialog>
    </>
  );
}
