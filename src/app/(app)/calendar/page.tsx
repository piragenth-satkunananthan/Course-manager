import { DaySheet } from "@/components/app/day-sheet";
import { MonthGrid } from "@/components/app/month-grid";
import { Header, Pager } from "@/components/app/timetable-header";
import { formatMonth } from "@/lib/format";
import { getMonth, monthDays } from "@/server/data/calendar";
import { listCourseOptions } from "@/server/data/courses";
import { addDays, todayIn, weekdayOf } from "@/server/domain/time";
import { requireStudentId } from "@/server/session";
import { Month } from "@/shared/schemas/calendar";
import { IsoDate } from "@/shared/schemas/common";

const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthHref = (month: string) => `/calendar?month=${month}`;

// The month view (design-system §6.9, §7.4; #20): classes, Assignments and Exams together; ?day= opens the day sheet.
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string; day?: string }> }) {
  const studentId = await requireStudentId();
  const today = todayIn();
  const q = await searchParams;
  const month = Month.safeParse(q.month).success ? q.month! : today.slice(0, 7);
  const [data, courses] = await Promise.all([getMonth(studentId, month), listCourseOptions(studentId)]);
  const selected = IsoDate.safeParse(q.day).success && monthDays(month).includes(q.day!) ? q.day! : null;
  const focus = selected ?? (today.startsWith(month) ? today : `${month}-01`);
  const thisMonth = today.slice(0, 7);
  return (
    <>
      <Header courses={courses} date={focus} view="month" hrefs={{ day: `/timetable?view=day&date=${focus}`, week: `/timetable?view=week&week=${addDays(focus, 1 - weekdayOf(focus))}`, month: monthHref(month) }} />
      <Pager
        label={formatMonth(month)}
        prev={monthHref(shiftMonth(month, -1))} prevLabel="Previous month" next={monthHref(shiftMonth(month, 1))} nextLabel="Next month"
        home={monthHref(thisMonth)} homeLabel="This month" current={month === thisMonth}
      />
      <MonthGrid data={data} today={today} selected={selected} />
      <DaySheet day={data.days.find((d) => d.date === selected) ?? null} month={month} today={today} courses={courses} />
    </>
  );
}
