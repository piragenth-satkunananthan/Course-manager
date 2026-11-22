"use client";
// The desktop week grid (design-system §6.8, #19): Monday to Sunday, 07:00 to 20:00 at 48 px per hour. A Deadline
// strip on top of each day, class blocks in the Course colour, and a current-time line on today. It scrolls
// vertically only. Each class and Deadline is a button that opens the same sheet as the day list.
import { Ban, ChevronDown, ChevronUp, CircleAlert, CircleCheck, CirclePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { COLOUR_BG } from "@/lib/course-colours";
import { deadlineDate } from "@/lib/deadline-date";
import { occurrenceKey } from "@/lib/occurrence-key";
import { formatDate, SESSION_KIND_LABEL } from "@/lib/format";
import { FIRST_HOUR, GRID_HEIGHT, HOUR_PX, LAST_HOUR, layoutDay, nowOffset } from "@/lib/week-layout";
import { instantToLocal } from "@/server/domain/time";
import type { Deadline } from "@/shared/schemas/dashboard";
import type { Occurrence } from "@/shared/schemas/timetable";
import { DeadlineDetail } from "./deadline-item";
import type { CourseOption } from "./form";
import { OccurrenceSheet } from "./occurrence";

type Props = { days: string[]; occurrences: Occurrence[]; deadlines: Deadline[]; today: string; courses: CourseOption[] };
const STATUS = { normal: "", cancelled: ", cancelled", rescheduled: ", moved", extra: ", extra session" } as const;
const timeOf = (d: Deadline) => (d.type === "assignment" ? d.item.dueTime : d.item.startTime);

/** The current time, read only after the page has loaded (so server and browser render the same) and each minute after. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ClassBlock({ o, style, cutStart, cutEnd }: { o: Occurrence; style: React.CSSProperties; cutStart: boolean; cutEnd: boolean }) {
  const [open, setOpen] = useState(false);
  const cancelled = o.status === "cancelled";
  const label = `${o.courseCode} ${SESSION_KIND_LABEL[o.kind]}, ${formatDate(o.date)}, ${o.startTime} to ${o.endTime}${o.location ? `, ${o.location}` : ""}${STATUS[o.status]}`;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        style={style}
        className={`absolute flex overflow-hidden rounded-sm border border-border bg-card text-left text-xs shadow-xs outline-none hover:bg-muted focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring ${cancelled ? "opacity-60" : ""}`}
      >
        <span aria-hidden="true" className={`w-1 shrink-0 ${COLOUR_BG[o.colour]}`} />
        <span className="min-w-0 flex-1 px-1.5 py-0.5">
          <span className={`flex items-center gap-1 font-semibold ${cancelled ? "line-through" : ""}`}>
            {cancelled && <Ban size={12} aria-hidden="true" />}
            {o.status === "extra" && <CirclePlus size={12} aria-hidden="true" />}
            <span className="truncate">{o.courseCode}</span>
          </span>
          <span className="block truncate text-muted-foreground tabular-nums">{o.startTime}–{o.endTime}{o.location ? ` · ${o.location}` : ""}</span>
        </span>
        {/* Starts before 07:00 or ends after 20:00: the block is cut at the grid's edge (its times are on it). */}
        {cutStart && <ChevronUp size={12} aria-hidden="true" className="absolute top-0 right-0.5 text-muted-foreground" />}
        {cutEnd && <ChevronDown size={12} aria-hidden="true" className="absolute right-0.5 bottom-0 text-muted-foreground" />}
      </button>
      <OccurrenceSheet o={o} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DeadlineChip({ d, today, now, courses }: { d: Deadline; today: string; now: Date | null; courses: CourseOption[] }) {
  const [open, setOpen] = useState(false);
  const submitted = d.type === "assignment" && d.item.status === "submitted";
  // dueAt is the server's due instant (an untimed Assignment is due at 23:59); no clock until the page has loaded.
  const overdue = d.type === "assignment" && !submitted && !!now && !!d.item.dueAt && new Date(d.item.dueAt) < now;
  const label = `${d.item.courseCode} ${d.type === "assignment" ? "Assignment" : "Exam"}: ${d.item.title}${timeOf(d) ? `, ${timeOf(d)}` : ""}${submitted ? ", submitted" : overdue ? ", overdue" : ""}`;
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className={`flex min-h-10 w-full items-center gap-1 rounded-sm border bg-card px-1.5 text-left text-xs outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring ${overdue ? "border-destructive ring-1 ring-destructive" : "border-border"} ${submitted ? "text-muted-foreground line-through" : ""}`}
      >
        <span aria-hidden="true" className={`h-4 w-1 shrink-0 rounded-full ${COLOUR_BG[d.item.courseColour]}`} />
        {overdue && <CircleAlert size={12} aria-hidden="true" className="shrink-0 text-destructive" />}
        {submitted && <CircleCheck size={12} aria-hidden="true" className="shrink-0 text-success" />}
        <span className="truncate"><span className="font-semibold">{d.item.courseCode}</span> {d.item.title}</span>
      </button>
      <DeadlineDetail deadline={d} open={open} onOpenChange={setOpen} today={today} courses={courses} />
    </li>
  );
}

export function WeekGrid({ days, occurrences, deadlines, today, courses }: Props) {
  const now = useNow();
  const local = now && instantToLocal(now);
  const line = local?.date === today ? nowOffset(local.time) : null;
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, i) => FIRST_HOUR + i); // 07:00 to 20:00, both edges labelled
  const cols = "grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]";
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-card" role="region" aria-label={`Week of ${formatDate(days[0]!)}`}>
      {/* Day names and each day's Deadline strip */}
      <div className={`${cols} border-b border-border`}>
        <span />
        {days.map((day) => {
          const due = deadlines.filter((d) => deadlineDate(d) === day);
          return (
            <div key={day} className="min-w-0 border-l border-border p-1">
              <p id={`day-${day}`} className={`text-center text-sm font-semibold ${day === today ? "text-primary" : ""}`}>
                {formatDate(day)}
                {day === today && <span className="sr-only"> (today)</span>}
              </p>
              {due.length > 0 && (
                <ul aria-label={`Due ${formatDate(day)}`} className="mt-1 space-y-1">
                  {due.map((d) => <DeadlineChip key={`${d.type}-${d.item.id}`} d={d} today={today} now={now} courses={courses} />)}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {/* The hours: this part scrolls vertically, never sideways */}
      <div className="max-h-[calc(100dvh-18rem)] min-h-64 overflow-x-hidden overflow-y-auto" data-testid="week-scroll">
        <div className={cols} style={{ height: GRID_HEIGHT }}>
          <div aria-hidden="true" className="relative">
            {hours.map((h) => (
              <span key={h} className="absolute right-1 -translate-y-1/2 text-xs text-muted-foreground tabular-nums first:translate-y-0 last:-translate-y-full" style={{ top: (h - FIRST_HOUR) * HOUR_PX }}>
                {String(h).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day}
              role="group"
              aria-labelledby={`day-${day}`}
              className="relative border-l border-border"
              style={{ backgroundImage: `repeating-linear-gradient(to bottom, var(--border) 0 1px, transparent 1px ${HOUR_PX}px)` }}
            >
              {layoutDay(occurrences.filter((o) => o.date === day)).map((b) => (
                <ClassBlock
                  key={occurrenceKey(b.item)}
                  o={b.item}
                  cutStart={b.cutStart}
                  cutEnd={b.cutEnd}
                  style={{ top: b.top, height: b.height, left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`, width: `calc(${100 / b.lanes}% - 4px)` }}
                />
              ))}
              {day === today && line !== null && (
                <div role="img" aria-label={`Now, ${local!.time}`} className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary" style={{ top: line }} data-testid="now-line" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
