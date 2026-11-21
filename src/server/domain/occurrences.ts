// Occurrences are calculated, never stored (design §3, file 22). Identity: (classSessionId, original date).
import { addDays, localToInstant, weekdayOf } from "./time";

type Kind = "lecture" | "tutorial" | "lab";
export type SessionInput = {
  id: string; courseId: string; kind: Kind; weekday: number; startTime: string; endTime: string; location: string | null;
  semesterStart: string; semesterEnd: string;
};
export type ChangeInput = {
  id: string; version: number; courseId: string; classSessionId: string | null; kind: "cancel" | "reschedule" | "extra";
  sessionKind: Kind | null; originalDate: string | null; newDate: string | null; newStartTime: string | null; newEndTime: string | null; newLocation: string | null;
};
export type Occurrence = {
  classSessionId: string | null; courseId: string; kind: Kind; date: string; startTime: string; endTime: string; location: string | null;
  status: "normal" | "cancelled" | "rescheduled" | "extra";
  originalDate: string | null; originalStartTime: string | null; // where a rescheduled class was moved from
  sessionChangeId: string | null; sessionChangeVersion: number | null;
};

/** Every Occurrence in [from, to] (local dates), with active Session Changes applied. M1: every week; M2 adds off-days and alternate weeks. */
export function expandOccurrences(sessions: SessionInput[], changes: ChangeInput[], range: { from: string; to: string }): Occurrence[] {
  const inRange = (d: string | null): d is string => !!d && d >= range.from && d <= range.to;
  const changeFor = new Map(changes.filter((c) => c.kind !== "extra").map((c) => [`${c.classSessionId}|${c.originalDate}`, c]));
  const out: Occurrence[] = [];
  const base = (s: SessionInput, date: string, c?: ChangeInput) => ({
    classSessionId: s.id, courseId: s.courseId, kind: s.kind, date, startTime: s.startTime, endTime: s.endTime, location: s.location,
    originalDate: null, originalStartTime: null, sessionChangeId: c?.id ?? null, sessionChangeVersion: c?.version ?? null,
  });

  for (const s of sessions) {
    const isOccurrence = (d: string) => d >= s.semesterStart && d <= s.semesterEnd && weekdayOf(d) === s.weekday;
    // Originals in range: normal or cancelled. Rescheduled ones are placed on their new date below.
    for (let d = range.from > s.semesterStart ? range.from : s.semesterStart; d <= range.to && d <= s.semesterEnd; d = addDays(d, 1)) {
      if (!isOccurrence(d)) continue;
      const c = changeFor.get(`${s.id}|${d}`);
      if (!c) out.push({ ...base(s, d), status: "normal" });
      else if (c.kind === "cancel") out.push({ ...base(s, d, c), status: "cancelled" });
    }
    for (const c of changes) {
      if (c.kind !== "reschedule" || c.classSessionId !== s.id || !inRange(c.newDate) || !isOccurrence(c.originalDate!)) continue;
      out.push({
        ...base(s, c.newDate, c), status: "rescheduled", startTime: c.newStartTime ?? s.startTime, endTime: c.newEndTime ?? s.endTime,
        location: c.newLocation ?? s.location, originalDate: c.originalDate, originalStartTime: s.startTime,
      });
    }
  }
  for (const c of changes) {
    if (c.kind !== "extra" || !inRange(c.newDate)) continue;
    out.push({
      classSessionId: null, courseId: c.courseId, kind: c.sessionKind ?? "lecture", date: c.newDate, startTime: c.newStartTime!, endTime: c.newEndTime!,
      location: c.newLocation, status: "extra", originalDate: null, originalStartTime: null, sessionChangeId: c.id, sessionChangeVersion: c.version,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
}

/** The class happening now gets the "Now" badge (design-system §6.2). A cancelled class never is. */
export const isHappeningNow = (o: Occurrence, now: Date) =>
  o.status !== "cancelled" && localToInstant(o.date, o.startTime) <= now && now < localToInstant(o.date, o.endTime);
