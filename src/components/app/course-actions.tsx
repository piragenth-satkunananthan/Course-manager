"use client";
// The Course detail ⋯ menu: Edit, Archive, and Delete, which needs the code typed (design-system §5, §7.2).
import { EllipsisVertical } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { apiFetch, toastApiError } from "@/lib/api-fetch";
import { Course } from "@/shared/schemas/course";
import { CourseForm } from "./course-form";
import { ResponsiveDialog } from "./responsive-dialog";

export function CourseActions({ course, semesterCourses }: { course: Course; semesterCourses: Course[] }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<"edit" | "archive" | "delete" | null>(null);
  const [typed, setTyped] = useState("");
  const [deleteError, setDeleteError] = useState<string>();
  const close = () => (setDialog(null), setTyped(""), setDeleteError(undefined));
  const summary = useRef<HTMLParagraphElement>(null);
  useEffect(() => summary.current?.focus(), [deleteError]);

  async function archive() {
    const res = await apiFetch(`/courses/${course.id}/archive`, { method: "POST", schema: Course });
    close();
    if (!res.ok) return toastApiError(res.error);
    toast.success(`${course.code} archived`);
    router.refresh();
  }

  async function remove(e: React.FormEvent) {
    e.preventDefault();
    const res = await apiFetch(`/courses/${course.id}?confirmCode=${encodeURIComponent(typed)}`, { method: "DELETE" });
    if (!res.ok) return setDeleteError(res.error.fieldErrors?.confirmCode ?? res.error.message);
    toast.success(`${course.code} deleted`);
    router.push("/courses");
    router.refresh();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${course.code}`} title="Actions">
            <EllipsisVertical size={20} strokeWidth={1.75} aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("edit")}>Edit</DropdownMenuItem>
          {!course.archivedAt && <DropdownMenuItem onSelect={() => setDialog("archive")}>Archive</DropdownMenuItem>}
          <DropdownMenuItem variant="destructive" onSelect={() => setDialog("delete")}>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ResponsiveDialog open={dialog === "edit"} onOpenChange={(o) => !o && close()} title={`Edit ${course.code}`}>
        <CourseForm semesters={[]} course={course} semesterCourses={semesterCourses} onDone={() => (close(), router.refresh())} />
      </ResponsiveDialog>

      <AlertDialog open={dialog === "archive"} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {course.code}?</AlertDialogTitle>
            <AlertDialogDescription>It leaves the dashboard. The Course and its data stay available under Archived.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={archive}>Archive</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          <form onSubmit={remove} noValidate className="grid gap-4">
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {course.code}?</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes its Class Sessions, Assignments, Exams and Nicknames, and unlinks its WhatsApp group. It can&apos;t be undone. To keep its history, archive it instead.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {deleteError && (
              <p ref={summary} tabIndex={-1} role="alert" className="rounded-sm bg-destructive-subtle p-3 text-sm font-medium text-destructive">
                Couldn&apos;t delete: {deleteError}
              </p>
            )}
            <Field data-invalid={!!deleteError}>
              <FieldLabel htmlFor="confirmCode">Type {course.code} to confirm</FieldLabel>
              <Input
                id="confirmCode"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                aria-invalid={!!deleteError}
                aria-describedby={deleteError ? "confirmCode-error" : undefined}
              />
              {deleteError && <FieldError id="confirmCode-error">{deleteError}</FieldError>}
            </Field>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
              <Button type="submit" variant="destructive" disabled={typed.trim().toLowerCase() !== course.code.toLowerCase()}>
                Delete {course.code}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
