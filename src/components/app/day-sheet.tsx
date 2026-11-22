"use client";
// The day sheet (design-system §6.9, #20): a day's classes, then its Deadlines, opened from the month view. A bottom
// sheet on phones and a side panel on desktop; the day is in the URL, so closing removes it.
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate } from "@/lib/format";
import { occurrenceKey } from "@/lib/occurrence-key";
import { isHappeningNow } from "@/server/domain/occurrences";
import { addDays } from "@/server/domain/time";
import type { CalendarMonth } from "@/shared/schemas/calendar";
import { DeadlineItem } from "./deadline-item";
import type { CourseOption } from "./form";
import { SessionItem } from "./occurrence";

const DESKTOP = "(min-width: 768px)";
const subscribe = (onChange: () => void) => {
  const m = window.matchMedia(DESKTOP);
  m.addEventListener("change", onChange);
  return () => m.removeEventListener("change", onChange);
};
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function DaySheet({ day, month, today, courses }: { day: CalendarMonth["days"][number] | null; month: string; today: string; courses: CourseOption[] }) {
  const router = useRouter();
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP).matches, () => true);
  const close = () => router.push(`/calendar?month=${month}`, { scroll: false });
  const now = new Date();
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
          <div className="space-y-4 px-4 pb-4">
            {day.occurrences.length > 0 && (
              <ul aria-label="Classes" className="space-y-2">
                {day.occurrences.map((o) => (
                  <SessionItem key={occurrenceKey(o)} o={o} now={isHappeningNow(o, now)} />
                ))}
              </ul>
            )}
            {day.deadlines.length > 0 && (
              <section aria-labelledby="sheet-due">
                <h3 id="sheet-due" className="font-semibold">Due</h3>
                <ul className="mt-2 space-y-2">
                  {day.deadlines.map((d) => (
                    <DeadlineItem key={`${d.type}-${d.item.id}`} deadline={d} today={today} tomorrow={addDays(today, 1)} courses={courses} />
                  ))}
                </ul>
              </section>
            )}
            {!day.occurrences.length && !day.deadlines.length && <p className="text-sm text-muted-foreground">Nothing on this day.</p>}
          </div>
        </SheetContent>
      )}
    </Sheet>
  );
}
