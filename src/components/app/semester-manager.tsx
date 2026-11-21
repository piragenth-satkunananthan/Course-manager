"use client";
// Settings → Semesters: list, create, set current, archive (design-system §7.6).
import { zodResolver } from "@hookform/resolvers/zod";
import { Archive, CircleCheck, EllipsisVertical, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import * as z from "zod";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api-fetch";
import { formatDate } from "@/lib/format";
import { type Semester, SemesterCreate } from "@/shared/schemas/semester";
import { applyServerError, ErrorSummary, TextField } from "./form";
import { ResponsiveDialog } from "./responsive-dialog";

const range = (s: Semester) => `${formatDate(s.startDate, { weekday: false, year: true })} – ${formatDate(s.endDate, { weekday: false, year: true })}`;

function SemesterForm({ onDone }: { onDone: () => void }) {
  const form = useForm<z.input<typeof SemesterCreate>, unknown, z.output<typeof SemesterCreate>>({
    shouldFocusError: false, // the error summary takes focus instead (design-system §3)
    resolver: zodResolver(SemesterCreate),
    mode: "onTouched",
    defaultValues: { name: "", startDate: "", endDate: "" },
  });
  const { isSubmitting, errors, submitCount } = form.formState;

  async function onSubmit(values: z.output<typeof SemesterCreate>) {
    const res = await apiFetch("/semesters", { method: "POST", body: values });
    if (!res.ok) return applyServerError(form, res.error);
    toast.success("Saved");
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4 pb-4">
      <ErrorSummary errors={errors} submitCount={submitCount} labels={{ name: "Name", startDate: "Start date", endDate: "End date" }} />
      <TextField control={form.control} name="name" label="Name" required help='For example "Year 2 · Semester 1"' />
      <TextField control={form.control} name="startDate" label="Start date" type="date" required />
      <TextField control={form.control} name="endDate" label="End date" type="date" required help="Weekly classes repeat until this date" />
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting} className="max-md:w-full">
          {isSubmitting ? "Saving…" : "Add Semester"}
        </Button>
      </div>
    </form>
  );
}

export function SemesterManager({ semesters }: { semesters: Semester[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [archiving, setArchiving] = useState<Semester | null>(null);

  async function act(path: string, done: string) {
    const res = await apiFetch(path, { method: "POST" });
    if (!res.ok) return void toast.error(res.error.message);
    toast.success(done);
    router.refresh();
  }

  return (
    <section aria-labelledby="semesters-heading" className="rounded-md border border-border bg-card p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 id="semesters-heading" className="text-title font-semibold">Semesters</h2>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
          Add Semester
        </Button>
      </div>

      {semesters.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No Semesters yet. Add the one you&apos;re in now; weekly classes repeat between its dates.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border">
          {semesters.map((s) => (
            <li key={s.id} className="flex min-h-14 items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-muted-foreground tabular-nums">{range(s)}</p>
              </div>
              {s.isCurrent && (
                <Badge className="bg-primary-subtle text-primary">
                  <CircleCheck aria-hidden="true" />
                  Current
                </Badge>
              )}
              {s.archivedAt && (
                <Badge variant="secondary" className="text-muted-foreground">
                  <Archive aria-hidden="true" />
                  Archived
                </Badge>
              )}
              {!s.archivedAt && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${s.name}`} title="Actions">
                      <EllipsisVertical size={20} strokeWidth={1.75} aria-hidden="true" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {!s.isCurrent && <DropdownMenuItem onSelect={() => act(`/semesters/${s.id}/set-current`, `${s.name} is now current`)}>Set as current</DropdownMenuItem>}
                    <DropdownMenuItem onSelect={() => setArchiving(s)}>Archive</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}

      <ResponsiveDialog open={adding} onOpenChange={setAdding} title="Add Semester">
        <SemesterForm onDone={() => (setAdding(false), router.refresh())} />
      </ResponsiveDialog>

      <AlertDialog open={!!archiving} onOpenChange={(o) => !o && setArchiving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {archiving?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Its Courses leave the dashboard and stay available. Stored WhatsApp message text from this Semester is erased. This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiving && act(`/semesters/${archiving.id}/archive`, `${archiving.name} archived`)}>Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
