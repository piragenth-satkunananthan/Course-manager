import * as z from "zod";
import { Id, IsoDate, LocalTime, optionalText, Version } from "./common";
import { CourseColour } from "./course";

export const SESSION_KINDS = ["lecture", "tutorial", "lab"] as const;
export const SessionKind = z.enum(SESSION_KINDS, { error: "Choose Lecture, Tutorial or Lab" });
const Weekday = z.coerce.number({ error: "Choose a day" }).int().min(1, "Choose a day").max(7, "Choose a day");
const endAfterStart = <T extends { start?: string | null; end?: string | null }>(v: T) => !v.start || !v.end || v.end > v.start;
const timeRule = { path: ["end"], message: "The end time must be after the start time" };

// ---- Class Sessions (weekly) ----
const sessionFields = { kind: SessionKind, weekday: Weekday, startTime: LocalTime, endTime: LocalTime, location: optionalText(100) };
const sessionTimes = (v: { startTime?: string; endTime?: string }) => !v.startTime || !v.endTime || v.endTime > v.startTime;
const sessionTimeRule = { path: ["endTime"], message: "The end time must be after the start time" };
export const ClassSessionCreate = z.strictObject(sessionFields).refine(sessionTimes, sessionTimeRule);
export type ClassSessionCreate = z.output<typeof ClassSessionCreate>;
// A partial edit is checked against the stored times in the data layer.
export const ClassSessionUpdate = z.strictObject(sessionFields).partial().refine(sessionTimes, sessionTimeRule);
export type ClassSessionUpdate = z.output<typeof ClassSessionUpdate>;

export const ClassSession = z.object({
  id: Id, courseId: Id, kind: SessionKind, weekday: z.number().int(), startTime: z.string(), endTime: z.string(), location: z.string().nullable(),
});
export type ClassSession = z.infer<typeof ClassSession>;

// ---- Session Changes (one occurrence) ----
export const SessionChangeCreate = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("cancel"), classSessionId: Id, date: IsoDate }),
  z
    .strictObject({ kind: z.literal("reschedule"), classSessionId: Id, date: IsoDate, newDate: IsoDate, newStart: LocalTime, newEnd: LocalTime, newLocation: optionalText(100) })
    .refine((v) => v.newEnd > v.newStart, { path: ["newEnd"], message: "The end time must be after the start time" }),
  z
    .strictObject({ kind: z.literal("extra"), courseId: z.uuid({ error: "Choose a Course" }), sessionKind: SessionKind, date: IsoDate, start: LocalTime, end: LocalTime, location: optionalText(100) })
    .refine(endAfterStart, timeRule),
]);
export type SessionChangeCreate = z.output<typeof SessionChangeCreate>;

export const SessionChangeUpdate = z.strictObject({
  expectedVersion: Version,
  kind: z.enum(["cancel", "reschedule", "extra"]).optional(),
  newDate: IsoDate.optional(),
  newStart: LocalTime.optional(),
  newEnd: LocalTime.optional(),
  newLocation: optionalText(100).optional(),
});
export type SessionChangeUpdate = z.output<typeof SessionChangeUpdate>;

export const SessionChange = z.object({
  id: Id, courseId: Id, classSessionId: Id.nullable(), kind: z.enum(["cancel", "reschedule", "extra"]), sessionKind: SessionKind.nullable(),
  originalDate: z.string().nullable(), newDate: z.string().nullable(), newStartTime: z.string().nullable(), newEndTime: z.string().nullable(),
  newLocation: z.string().nullable(), version: z.number().int(),
});
export type SessionChange = z.infer<typeof SessionChange>;

// ---- Reading ----
export const Occurrence = z.object({
  classSessionId: Id.nullable(), courseId: Id, courseCode: z.string(), colour: CourseColour, date: z.string(), startTime: z.string(), endTime: z.string(),
  location: z.string().nullable(), kind: SessionKind, status: z.enum(["normal", "cancelled", "rescheduled", "extra"]),
  originalDate: z.string().nullable(), originalStartTime: z.string().nullable(), sessionChangeId: Id.nullable(), sessionChangeVersion: z.number().int().nullable(),
});
export type Occurrence = z.infer<typeof Occurrence>;
export const TimetableQuery = z.strictObject({
  week: IsoDate.refine((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1, "The week starts on a Monday"),
});

// ---- Form shapes (the browser builds the POST/PATCH bodies from these) ----
export const RescheduleForm = z
  .strictObject({ newDate: IsoDate, newStart: LocalTime, newEnd: LocalTime, newLocation: optionalText(100) })
  .refine((v) => v.newEnd > v.newStart, { path: ["newEnd"], message: "The end time must be after the start time" });
export type RescheduleForm = z.output<typeof RescheduleForm>;
export const ExtraForm = z
  .strictObject({ courseId: z.uuid({ error: "Choose a Course" }), sessionKind: SessionKind, date: IsoDate, start: LocalTime, end: LocalTime, location: optionalText(100) })
  .refine(endAfterStart, timeRule);
export type ExtraForm = z.output<typeof ExtraForm>;
