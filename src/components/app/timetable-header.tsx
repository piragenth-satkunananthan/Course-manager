// The timetable's title row and its ‹ › pager, shared by the day list, the week grid and the month (#19, #20).
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { CourseOption } from "./form";
import { AddExtraClass } from "./occurrence";
import { type View, ViewSwitch } from "./view-switch";

const nav = "inline-flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-muted md:size-10";

export function Pager({ label, prev, next, prevLabel, nextLabel, home, homeLabel, current }: { label: string; prev: string; next: string; prevLabel: string; nextLabel: string; home: string; homeLabel: string; current: boolean }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <Link href={prev} aria-label={prevLabel} title={prevLabel} className={nav}>
        <ChevronLeft size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <p className="min-w-0 flex-1 text-center font-semibold sm:flex-none sm:min-w-32" aria-live="polite">{label}</p>
      <Link href={next} aria-label={nextLabel} title={nextLabel} className={nav}>
        <ChevronRight size={20} strokeWidth={1.75} aria-hidden="true" />
      </Link>
      <Button asChild variant="outline" className="ml-auto">
        <Link href={home} aria-current={current ? "date" : undefined}>{homeLabel}</Link>
      </Button>
    </div>
  );
}

export function Header({ courses, date, view, hrefs }: { courses: CourseOption[]; date: string; view: View; hrefs: Record<View, string> }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-2xl font-bold md:text-display">Timetable</h1>
      <div className="flex flex-wrap items-center gap-2">
        <ViewSwitch view={view} hrefs={hrefs} />
        {courses.length > 0 && <AddExtraClass courses={courses} date={date} />}
      </div>
    </div>
  );
}
