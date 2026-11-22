// One day's classes, then its Deadlines (design-system §6.7): the day list's body, shared by the timetable's day view
// and the month view's day sheet (#20). `now` is null until known (the sheet reads the clock after load).
import { CalendarX } from "lucide-react";
import { isOverdueDeadline } from "@/lib/deadline-date";
import { formatDate } from "@/lib/format";
import { occurrenceKey } from "@/lib/occurrence-key";
import { isHappeningNow } from "@/server/domain/occurrences";
import { addDays } from "@/server/domain/time";
import type { Deadline } from "@/shared/schemas/dashboard";
import type { Occurrence } from "@/shared/schemas/timetable";
import { DeadlineItem } from "./deadline-item";
import { EmptyState } from "./empty-state";
import type { CourseOption } from "./form";
import { SessionItem } from "./occurrence";

type Props = { date: string; today: string; now: Date | null; occurrences: Occurrence[]; deadlines: Deadline[]; courses: CourseOption[]; heading?: "h2" | "h3" };

export function DayItems({ date, today, now, occurrences, deadlines, courses, heading: H = "h2" }: Props) {
  return (
    <>
      <section aria-label={`Classes on ${formatDate(date)}`}>
        {occurrences.length === 0 ? (
          <EmptyState icon={CalendarX}>No classes on {formatDate(date)}.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {occurrences.map((o) => (
              <SessionItem key={occurrenceKey(o)} o={o} now={!!now && isHappeningNow(o, now)} />
            ))}
          </ul>
        )}
      </section>
      {deadlines.length > 0 && (
        <section aria-labelledby={`due-${date}`} className="mt-6">
          <H id={`due-${date}`} className="text-title font-semibold">Due</H>
          <ul className="mt-2 space-y-2">
            {deadlines.map((d) => (
              <DeadlineItem key={`${d.type}-${d.item.id}`} deadline={d} overdue={isOverdueDeadline(d, now)} today={today} tomorrow={addDays(today, 1)} courses={courses} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
