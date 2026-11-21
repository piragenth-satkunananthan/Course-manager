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
