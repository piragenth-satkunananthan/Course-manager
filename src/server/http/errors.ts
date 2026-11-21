// The data layer throws these; withStudent turns them into the shared error body (design §7, file 33).
import type { ErrorCode } from "@/shared/schemas/common";

export const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN_ORIGIN: 403,
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNDO_BLOCKED: 409,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly extra: { fieldErrors?: Record<string, string>; current?: unknown; existingId?: string } = {},
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", `${what} not found`);
export const invalid = (field: string, message: string) => new AppError("VALIDATION", message, { fieldErrors: { [field]: message } });
