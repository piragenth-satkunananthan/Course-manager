// Shared API contract pieces (design §7, file 28). Imported by route handlers and by browser code.
import * as z from "zod";

export const Id = z.uuid();

/** A local calendar date, "YYYY-MM-DD" (Asia/Colombo). */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d), "Not a real date");

export const ERROR_CODES = ["UNAUTHENTICATED", "FORBIDDEN_ORIGIN", "VALIDATION", "NOT_FOUND", "CONFLICT", "UNDO_BLOCKED", "RATE_LIMITED", "INTERNAL"] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ErrorBody = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    fieldErrors: z.record(z.string(), z.string()).optional(),
    requestId: z.string(),
    current: z.unknown().optional(),
    existingId: z.string().optional(),
  }),
});
export type ErrorBody = z.infer<typeof ErrorBody>;

/** A local wall-clock time, "HH:mm" (Asia/Colombo). */
export const LocalTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use the format HH:mm, for example 16:30");

/** For PATCH bodies and DELETE queries on items the AI can change (optimistic locking, §7). */
export const Version = z.coerce.number().int().min(1);

/** Optional text from a form: trimmed, and empty becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .nullish()
    .transform((v) => v || null);

/** An optional local time from a form: empty becomes null. */
export const optionalTime = z
  .union([LocalTime, z.literal("")])
  .nullish()
  .transform((v) => v || null);
