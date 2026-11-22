"use client";
// The desktop week grid (design-system §6.8, #19): Monday to Sunday, 07:00 to 20:00 at 48 px per hour. A Deadline
// strip on top of each day, class blocks in the Course colour, and a current-time line on today. It scrolls
// vertically only. Each class and Deadline is a button that opens the same sheet as the day list.
import { Ban, CirclePlus } from "lucide-react";
import { useEffect, useState } from "react";
import { COLOUR_BG } from "@/lib/course-colours";
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
const dateOf = (d: Deadline) => (d.type === "assignment" ? d.item.dueDate : d.item.date);
const timeOf = (d: Deadline) => (d.type === "assignment" ? d.item.dueTime : d.item.startTime);

/** The current local time, refreshed each minute, so the line moves. */
function useNow() {
  const [now, setNow] = useState(() => instantToLocal(new Date()));
  useEffect(() => {
    const t = setInterval(() => setNow(instantToLocal(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function ClassBlock({ o, style }: { o: Occurrence; style: React.CSSProperties }) {
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
      </button>
      <OccurrenceSheet o={o} open={open} onOpenChange={setOpen} />
    </>
  );
}

function DeadlineChip({ d, today, courses }: { d: Deadline; today: string; courses: CourseOption[] }) {
  const [open, setOpen] = useState(false);
  const submitted = d.type === "assignment" && d.item.status === "submitted";
  const due = `${dateOf(d)} ${timeOf(d) ?? "23:59"}`;
  const local = instantToLocal(new Date());
  const overdue = d.type === "assignment" && !submitted && due < `${local.date} ${local.time}`;
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
        <span className="truncate"><span className="font-semibold">{d.item.courseCode}</span> {d.item.title}</span>
      </button>
      <DeadlineDetail deadline={d} open={open} onOpenChange={setOpen} today={today} courses={courses} />
    </li>
  );
}

export function WeekGrid({ days, occurrences, deadlines, today, courses }: Props) {
  const now = useNow();
  const line = now.date === today ? nowOffset(now.time) : null;
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i);
  const cols = "grid grid-cols-[3rem_repeat(7,minmax(0,1fr))]";
  return (
    <div className="mt-4 overflow-hidden rounded-md border border-border bg-card" role="region" aria-label={`Week of ${formatDate(days[0]!)}`}>
      {/* Day names and each day's Deadline strip */}
      <div className={`${cols} border-b border-border`}>
        <span />
        {days.map((day) => {
          const due = deadlines.filter((d) => dateOf(d) === day);
          return (
            <div key={day} className="min-w-0 border-l border-border p-1">
              <p id={`day-${day}`} className={`text-center text-sm font-semibold ${day === today ? "text-primary" : ""}`}>
                {formatDate(day)}
                {day === today && <span className="sr-only"> (today)</span>}
              </p>
              {due.length > 0 && (
                <ul aria-label={`Due ${formatDate(day)}`} className="mt-1 space-y-1">
                  {due.map((d) => <DeadlineChip key={`${d.type}-${d.item.id}`} d={d} today={today} courses={courses} />)}
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
              <span key={h} className="absolute right-1 -translate-y-1/2 text-xs text-muted-foreground tabular-nums first:translate-y-0" style={{ top: (h - FIRST_HOUR) * HOUR_PX }}>
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
                  key={`${b.item.classSessionId ?? b.item.sessionChangeId}-${b.item.date}-${b.item.startTime}`}
                  o={b.item}
                  style={{ top: b.top, height: b.height, left: `calc(${(b.lane / b.lanes) * 100}% + 2px)`, width: `calc(${100 / b.lanes}% - 4px)` }}
                />
              ))}
              {day === today && line !== null && (
                <div role="img" aria-label={`Now, ${now.time}`} className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-primary" style={{ top: line }} data-testid="now-line" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
