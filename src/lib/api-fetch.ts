// Browser calls to /api/v1 (design file 52). Errors come back typed, never thrown, so forms can show them.
import { ErrorBody } from "@/shared/schemas/common";

export type ApiError = ErrorBody["error"];
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export async function apiFetch<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<ApiResult<T>> {
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
  if (res.ok) return { ok: true, data: json as T };
  const parsed = ErrorBody.safeParse(json);
  return { ok: false, error: parsed.success ? parsed.data.error : { code: "INTERNAL", message: `Unexpected response (${res.status})`, requestId: "" } };
}
