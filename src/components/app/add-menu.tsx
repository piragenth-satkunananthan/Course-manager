"use client";
// The "+" menu on the dashboard: Assignment or Exam (design-system §7.1).
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AssignmentForm, ExamForm } from "./assessment-forms";
import type { CourseOption } from "./form";
import { ResponsiveDialog } from "./responsive-dialog";

export function AddMenu({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState<"assignment" | "exam" | null>(null);
  const done = () => (setAdding(null), router.refresh());
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <Plus size={20} strokeWidth={1.75} aria-hidden="true" />
            Add
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setAdding("assignment")}>Assignment</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setAdding("exam")}>Exam</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ResponsiveDialog open={adding === "assignment"} onOpenChange={(o) => !o && setAdding(null)} title="New Assignment">
        <AssignmentForm courses={courses} onDone={done} />
      </ResponsiveDialog>
      <ResponsiveDialog open={adding === "exam"} onOpenChange={(o) => !o && setAdding(null)} title="New Exam">
        <ExamForm courses={courses} onDone={done} />
      </ResponsiveDialog>
    </>
  );
}
