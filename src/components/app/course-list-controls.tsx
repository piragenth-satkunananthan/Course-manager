"use client";
// The Courses page header controls: the Semester picker (kept in the URL) and Add Course.
import { Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Semester } from "@/shared/schemas/semester";
import { CourseForm } from "./course-form";
import { ResponsiveDialog } from "./responsive-dialog";

export function SemesterPicker({ semesters, selectedId }: { semesters: Semester[]; selectedId: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="semester-picker" className="text-sm font-medium">Semester</label>
      <Select value={selectedId} onValueChange={(id) => router.push(`${path}?semester=${id}`)}>
        <SelectTrigger id="semester-picker" className="min-w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {semesters.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
              {s.isCurrent ? " (current)" : s.archivedAt ? " (archived)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function AddCourseButton({ semesters, semesterId }: { semesters: Semester[]; semesterId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
        Add Course
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen} title="Add Course">
        <CourseForm semesters={semesters.filter((s) => !s.archivedAt)} defaultSemesterId={semesterId} onDone={() => (setOpen(false), router.refresh())} />
      </ResponsiveDialog>
    </>
  );
}
