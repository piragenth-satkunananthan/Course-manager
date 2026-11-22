// The only place that does time-zone arithmetic (design file 21). The app's zone is fixed (decision U2).
import { TZDate } from "@date-fns/tz";

export const APP_TIME_ZONE = "Asia/Colombo";

const pad = (n: number) => String(n).padStart(2, "0");

/** A local "YYYY-MM-DD" date and "HH:mm" time in Asia/Colombo, as an instant. */
export function localToInstant(date: string, time: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const [h, min] = time.split(":").map(Number) as [number, number];
  return new Date(+new TZDate(y, m - 1, d, h, min, APP_TIME_ZONE));
}

/** An instant as the local date and time in Asia/Colombo. */
export function instantToLocal(instant: Date): { date: string; time: string } {
  const t = new TZDate(+instant, APP_TIME_ZONE);
  return { date: `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`, time: `${pad(t.getHours())}:${pad(t.getMinutes())}` };
}

export const todayIn = (now: Date = new Date()) => instantToLocal(now).date;

/** Calendar arithmetic on a plain local date (no zone involved). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A YYYY-MM month moved by `months` (December + 1 is the next January). */
export function addMonths(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 7);
}

/** ISO weekday of a local date: 1 = Monday … 7 = Sunday. */
export function weekdayOf(date: string): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}
