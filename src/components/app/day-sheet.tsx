"use client";
// The day sheet (design-system §6.9, #20): a day's classes, then its Deadlines, opened from the month view. A bottom
// sheet on phones and a side panel on desktop; the day is in the URL, so closing removes it.
import { useRouter } from "next/navigation";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useNow } from "@/hooks/use-now";
import { calendarHref } from "@/lib/deadline-date";
import { formatDate, plural } from "@/lib/format";
import type { CalendarMonth } from "@/shared/schemas/calendar";
import { DayItems } from "./day-items";
import type { CourseOption } from "./form";


export function DaySheet({ day, month, today, courses }: { day: CalendarMonth["days"][number] | null; month: string; today: string; courses: CourseOption[] }) {
  const router = useRouter();
  // A side panel from 768 px, like every other dialog here (ResponsiveDialog); a bottom sheet below.
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const close = () => router.push(calendarHref(month), { scroll: false });
  const now = useNow();
  return (
    <Sheet open={!!day} onOpenChange={(o) => !o && close()}>
      {day && (
        <SheetContent
          side={desktop ? "right" : "bottom"}
          className={desktop ? "w-full overflow-y-auto sm:max-w-md" : "max-h-[85dvh] overflow-y-auto rounded-t-lg pb-[calc(1rem+env(safe-area-inset-bottom))]"}
        >
          <SheetHeader>
            <SheetTitle>{day.date === today ? `Today · ${formatDate(day.date)}` : formatDate(day.date)}</SheetTitle>
            <SheetDescription>
              {plural(day.occurrences.length, "class", "classes")} · {plural(day.deadlines.length, "Deadline")}
            </SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <DayItems date={day.date} today={today} now={now} occurrences={day.occurrences} deadlines={day.deadlines} courses={courses} heading="h3" />
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
