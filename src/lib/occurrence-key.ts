import type { Occurrence } from "@/shared/schemas/timetable";

/** A list key that stays unique when a class is moved onto a day that has its own occurrence of that class. Usable on server and client. */
export const occurrenceKey = (o: Occurrence) => `${o.classSessionId ?? "extra"}-${o.sessionChangeId ?? "weekly"}-${o.date}`;
