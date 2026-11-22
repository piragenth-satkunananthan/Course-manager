"use client";
// The month view (design-system §6.9, #20): 6 weeks of day cells, each with a dot per class (up to 4, then "+n";
// cancelled ones hollow and grey) and a chip per Deadline (Overdue: red ring and an icon). A grid you move through
// with the arrow keys; Enter or a tap opens the day sheet, whose day is in the URL.
import { CircleAlert, CircleCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useNow } from "@/hooks/use-now";
import { COLOUR_BG, COLOUR_LABEL } from "@/lib/course-colours";
import { occurrenceKey } from "@/lib/occurrence-key";
import { calendarHref, isOverdueDeadline } from "@/lib/deadline-date";
import { formatDate, formatMonth, plural } from "@/lib/format";
import type { CalendarMonth } from "@/shared/schemas/calendar";
import type { Deadline } from "@/shared/schemas/dashboard";

type Day = CalendarMonth["days"][number];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_DOTS = 4;
const MAX_CHIPS = 2;
const isSubmitted = (d: Deadline) => d.type === "assignment" && d.item.status === "submitted";

/** What a screen reader hears for a cell: the day, then its classes and Deadlines in words. */
function cellLabel(day: Day, today: string, now: Date | null) {
  const cancelled = day.occurrences.filter((o) => o.status === "cancelled").length;
  const classes = day.occurrences.length ? `${plural(day.occurrences.length, "class", "classes")}${cancelled ? `, ${cancelled} cancelled` : ""}` : "no classes";
  const deadlines = day.deadlines.map((d) => `${d.item.courseCode} ${d.item.title}${isOverdueDeadline(d, now) ? ", overdue" : isSubmitted(d) ? ", submitted" : ""}`);
  return `${formatDate(day.date)}${day.date === today ? ", today" : ""}: ${classes}${deadlines.length ? `; ${plural(deadlines.length, "Deadline")}: ${deadlines.join("; ")}` : ""}`;
}

function Chip({ d, now }: { d: Deadline; now: Date | null }) {
  const overdue = isOverdueDeadline(d, now);
  const submitted = isSubmitted(d);
  return (
    <span className={`flex min-w-0 items-center gap-0.5 rounded-sm border bg-card px-1 text-[11px] leading-4 ${overdue ? "border-destructive ring-1 ring-destructive" : "border-border"} ${submitted ? "text-muted-foreground" : ""}`}>
      <span aria-hidden="true" className={`h-3 w-0.5 shrink-0 rounded-full ${COLOUR_BG[d.item.courseColour]}`} />
      {overdue && <CircleAlert size={10} aria-hidden="true" className="shrink-0 text-destructive" />}
      {submitted && <CircleCheck size={10} aria-hidden="true" className="shrink-0 text-success" />}
      <span className="truncate font-semibold">{d.item.courseCode}</span>
      {/* From 768 px, a shortened title too */}
      <span className="truncate max-md:hidden">{d.item.title}</span>
    </span>
  );
}

export function MonthGrid({ data, today, selected }: { data: CalendarMonth; today: string; selected: string | null }) {
  const router = useRouter();
  const now = useNow();
  const startFocus = data.days.findIndex((d) => d.date === (selected ?? today));
  const [focus, setFocus] = useState(startFocus >= 0 ? startFocus : data.days.findIndex((d) => d.date.startsWith(data.month)));
  const cells = useRef<(HTMLButtonElement | null)[]>([]);
  const open = (date: string) => router.push(calendarHref(data.month, date), { scroll: false });

  // The arrow keys move a day or a week; Home and End go to the week's ends; the focused cell is the only tab stop.
  function onKeyDown(e: React.KeyboardEvent, i: number) {
    const to = { ArrowLeft: i - 1, ArrowRight: i + 1, ArrowUp: i - 7, ArrowDown: i + 7, Home: i - (i % 7), End: i - (i % 7) + 6 }[e.key];
    if (to === undefined || to < 0 || to >= data.days.length) return;
    e.preventDefault();
    setFocus(to);
    cells.current[to]?.focus();
  }

  const weeks = Array.from({ length: data.days.length / 7 }, (_, w) => data.days.slice(w * 7, w * 7 + 7));
  return (
    <div role="grid" aria-label={formatMonth(data.month)} className="mt-4 overflow-hidden rounded-md border border-border bg-card max-sm:-mx-4 max-sm:rounded-none max-sm:border-x-0">
      <div role="row" className="grid grid-cols-7 border-b border-border">
        {WEEKDAYS.map((w) => (
          <span key={w} role="columnheader" className="py-1 text-center text-xs font-semibold text-muted-foreground">{w}</span>
        ))}
      </div>
      {weeks.map((week, w) => (
        <div key={week[0]!.date} role="row" className="grid grid-cols-7 border-b border-border last:border-b-0">
          {week.map((day, d) => {
            const i = w * 7 + d;
            const inMonth = day.date.startsWith(data.month);
            const extraDots = day.occurrences.length - MAX_DOTS;
            const extraChips = day.deadlines.length - MAX_CHIPS;
            return (
              <div key={day.date} role="gridcell" aria-selected={day.date === selected} className="min-w-0 border-l border-border first:border-l-0">
                <button
                  ref={(el) => {
                    cells.current[i] = el;
                  }}
                  type="button"
                  tabIndex={i === focus ? 0 : -1}
                  onFocus={() => setFocus(i)}
                  onKeyDown={(e) => onKeyDown(e, i)}
                  onClick={() => open(day.date)}
                  aria-label={cellLabel(day, today, now)}
                  aria-current={day.date === today ? "date" : undefined}
                  className={`flex h-full min-h-14 w-full min-w-11 flex-col items-stretch gap-0.5 p-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset md:min-h-24 ${day.date === selected ? "bg-primary-subtle" : ""}`}
                >
                  <span
                    className={`inline-flex size-6 items-center justify-center self-start rounded-full text-caption tabular-nums ${day.date === today ? "ring-2 ring-primary font-semibold text-primary" : inMonth ? "" : "text-muted-foreground"}`}
                  >
                    {Number(day.date.slice(8))}
                  </span>
                  {day.occurrences.length > 0 && (
                    <span className="flex flex-wrap items-center gap-0.5" aria-hidden="true">
                      {day.occurrences.slice(0, MAX_DOTS).map((o) => (
                        <span
                          key={occurrenceKey(o)}
                          title={COLOUR_LABEL[o.colour]}
                          className={`size-2 rounded-full ${o.status === "cancelled" ? "border border-muted-foreground bg-transparent" : COLOUR_BG[o.colour]}`}
                          data-testid={o.status === "cancelled" ? "dot-cancelled" : "dot"}
                        />
                      ))}
                      {extraDots > 0 && <span className="text-[11px] leading-none text-muted-foreground">+{extraDots}</span>}
                    </span>
                  )}
                  {day.deadlines.slice(0, MAX_CHIPS).map((dl) => (
                    <span key={`${dl.type}-${dl.item.id}`} aria-hidden="true">
                      <Chip d={dl} now={now} />
                    </span>
                  ))}
                  {extraChips > 0 && <span aria-hidden="true" className="text-[11px] text-muted-foreground">+{extraChips}</span>}
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
