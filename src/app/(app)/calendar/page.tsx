import { DaySheet } from "@/components/app/day-sheet";
import { MonthGrid } from "@/components/app/month-grid";
import { Header, Pager } from "@/components/app/timetable-header";
import { calendarHref } from "@/lib/deadline-date";
import { formatMonth } from "@/lib/format";
import { getMonth, monthDays } from "@/server/data/calendar";
import { listCourseOptions } from "@/server/data/courses";
import { addDays, addMonths, todayIn, weekdayOf } from "@/server/domain/time";
import { requireStudentId } from "@/server/session";
import { Month } from "@/shared/schemas/calendar";
import { IsoDate } from "@/shared/schemas/common";


// The month view (design-system §6.9, §7.4; #20): classes, Assignments and Exams together; ?day= opens the day sheet.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const studentId = await requireStudentId();
  const today = todayIn();
  const q = await searchParams;
  const day = IsoDate.safeParse(q.day).success ? q.day! : null;
  // The design's link is /calendar?day=YYYY-MM-DD: with no month, the day's own month.
  const month = Month.safeParse(q.month).success ? q.month! : (day ?? today).slice(0, 7);
  const [data, courses] = await Promise.all([getMonth(studentId, month), listCourseOptions(studentId)]);
  const selected = day && monthDays(month).includes(day) ? day : null;
  const focus = selected ?? (today.startsWith(month) ? today : `${month}-01`);
  const thisMonth = today.slice(0, 7);
  return (
    <>
      <Header courses={courses} date={focus} view="month" hrefs={{ day: `/timetable?view=day&date=${focus}`, week: `/timetable?view=week&week=${addDays(focus, 1 - weekdayOf(focus))}`, month: calendarHref(month) }} />
      <Pager
        label={formatMonth(month)}
        prev={calendarHref(addMonths(month, -1))} prevLabel="Previous month" next={calendarHref(addMonths(month, 1))} nextLabel="Next month"
        home={calendarHref(thisMonth)} homeLabel="This month" current={month === thisMonth}
      />
      <MonthGrid key={month} data={data} today={today} selected={selected} />
      <DaySheet day={data.days.find((d) => d.date === selected) ?? null} month={month} today={today} courses={courses} />
    </>
  );
}
