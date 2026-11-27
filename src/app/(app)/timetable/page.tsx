import { DayItems } from "@/components/app/day-items";
import type { CourseOption } from "@/components/app/form";
import { Header, Pager } from "@/components/app/timetable-header";
import { WeekGrid } from "@/components/app/week-grid";
import { calendarHref, deadlineDate } from "@/lib/deadline-date";
import { formatDate } from "@/lib/format";
import { listDeadlinesIn } from "@/server/data/assessments";
import { listCourseOptions } from "@/server/data/courses";
import { getOccurrences } from "@/server/data/timetable";
import { getPrefs } from "@/server/data/settings";
import { weekStartOf } from "@/server/domain/defaults";
import { addDays, todayIn } from "@/server/domain/time";
import { requireStudentId } from "@/server/session";
import { IsoDate } from "@/shared/schemas/common";
import type { Deadline } from "@/shared/schemas/dashboard";
import type { Occurrence } from "@/shared/schemas/timetable";

const dayHref = (date: string) => `/timetable?view=day&date=${date}`;
const weekHref = (week: string) => `/timetable?view=week&week=${week}`;
const monthHref = (date: string) => calendarHref(date.slice(0, 7));

/** The day list (design-system §6.7): that day's classes, then what's due. */
function DayList({ date, today, occurrences, deadlines, courses }: { date: string; today: string; occurrences: Occurrence[]; deadlines: Deadline[]; courses: CourseOption[] }) {
  return (
    <>
      <Pager
        label={date === today ? `Today · ${formatDate(date)}` : formatDate(date)}
        prev={dayHref(addDays(date, -1))} prevLabel="Previous day" next={dayHref(addDays(date, 1))} nextLabel="Next day"
        home={dayHref(today)} homeLabel="Today" current={date === today}
      />
      <div className="mt-4">
        <DayItems date={date} today={today} now={new Date()} occurrences={occurrences} deadlines={deadlines} courses={courses} />
      </div>
    </>
  );
}

// The timetable (design-system §7.4): the day list everywhere, and from 1024 px the week grid, its default there (#19). Month: #20.
export default async function TimetablePage({ searchParams }: { searchParams: Promise<{ date?: string; view?: string; week?: string }> }) {
  const studentId = await requireStudentId();
  const today = todayIn();
  const q = await searchParams;
  // With no choice in the URL, the week: a grid from 1024 px, today's list below that (the design's routes table).
  const view: "day" | "week" = q.view === "day" || (!q.view && q.date) ? "day" : "week";
  const valid = (d?: string) => (IsoDate.safeParse(d).success ? d! : null);
  // The week starts on the Student's chosen day (Monday by default; #83).
  const { weekStart } = await getPrefs(studentId);
  const firstDay = (d: string) => weekStartOf(d, weekStart);

  if (view === "day") {
    const date = valid(q.date) ?? today;
    const [occurrences, deadlines, courses] = await Promise.all([getOccurrences(studentId, date, date), listDeadlinesIn(studentId, date, date), listCourseOptions(studentId)]);
    return (
      <>
        <Header courses={courses} date={date} view="day" hrefs={{ day: dayHref(date), week: weekHref(firstDay(date)), month: monthHref(date) }} />
        <DayList date={date} today={today} occurrences={occurrences} deadlines={deadlines} courses={courses} />
      </>
    );
  }

  const week = firstDay(valid(q.week) ?? today); // any date in the URL means its week
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const focus = days.includes(today) ? today : week; // the day shown below 1024 px
  const [occurrences, deadlines, courses] = await Promise.all([getOccurrences(studentId, week, days[6]!), listDeadlinesIn(studentId, week, days[6]!), listCourseOptions(studentId)]);
  const thisWeek = firstDay(today);
  return (
    <>
      <Header courses={courses} date={focus} view="week" hrefs={{ day: dayHref(focus), week: weekHref(week), month: monthHref(focus) }} />
      <div className="max-lg:hidden">
        <Pager
          label={`${formatDate(week, { weekday: false })} – ${formatDate(days[6]!, { weekday: false, year: true })}`}
          prev={weekHref(addDays(week, -7))} prevLabel="Previous week" next={weekHref(addDays(week, 7))} nextLabel="Next week"
          home={weekHref(thisWeek)} homeLabel="This week" current={week === thisWeek}
        />
        <WeekGrid days={days} occurrences={occurrences} deadlines={deadlines} today={today} courses={courses} />
      </div>
      {/* Under 1024 px there's no week grid: the day list instead (design-system §1). */}
      <div className="lg:hidden">
        <DayList
          date={focus} today={today} courses={courses}
          occurrences={occurrences.filter((o) => o.date === focus)}
          deadlines={deadlines.filter((d) => deadlineDate(d) === focus)}
        />
      </div>
    </>
  );
}
