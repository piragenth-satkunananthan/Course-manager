// Browser calls to /api/v1 (design file 52). Errors come back typed, never thrown, so forms can show them.
import { toast } from "sonner";
import type * as z from "zod";
import { ErrorBody } from "@/shared/schemas/common";

export type ApiError = ErrorBody["error"];
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/** Parses the response with `schema` when given, so a contract drift shows up as an error, not bad data. */
export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown; schema?: z.ZodType<T> } = {}): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: init.method ?? "GET",
      headers: init.body === undefined ? undefined : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    return { ok: false, error: { code: "INTERNAL", message: "Couldn't reach the server. Check your connection and try again.", requestId: "" } };
  }
  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : null;
  if (res.ok) {
    if (!init.schema) return { ok: true, data: json as T };
    const data = init.schema.safeParse(json);
    return data.success ? { ok: true, data: data.data } : { ok: false, error: { code: "INTERNAL", message: "The server sent an unexpected response", requestId: res.headers.get("x-request-id") ?? "" } };
  }
  const parsed = ErrorBody.safeParse(json);
  return { ok: false, error: parsed.success ? parsed.data.error : { code: "INTERNAL", message: `Unexpected response (${res.status})`, requestId: "" } };
}

/** For errors that aren't about a form field: a toast with the request id, so a log line can be found (design file 52). */
export function toastApiError(error: ApiError) {
  toast.error(error.message, error.requestId ? { description: `Reference: ${error.requestId}` } : undefined);
}
