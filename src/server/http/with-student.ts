// Every /api/v1 handler goes through here (design §7, file 32): session, Origin check, zod parsing,
// the data call with the session's studentId, and errors mapped to the shared error body.
import * as z from "zod";
import { auth } from "@/server/auth";
import { log } from "@/server/log";
import type { ErrorCode } from "@/shared/schemas/common";
import { AppError, STATUS } from "./errors";

type Ctx = { params?: Promise<Record<string, string>> }; // Next.js passes no params for routes without a dynamic segment
type Spec<B extends z.ZodType, Q extends z.ZodType> = { body?: B; query?: Q; status?: number };
type Input<B, Q> = { studentId: string; body: B; query: Q; id: string };

const ORIGIN = process.env.APP_ORIGIN;

function errorResponse(code: ErrorCode, message: string, requestId: string, extra: object = {}) {
  return Response.json({ error: { code, message, requestId, ...extra } }, { status: STATUS[code] });
}

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) out[String(issue.path[0] ?? "_")] ??= issue.message;
  return out;
}

/**
 * Wraps a route handler. The handler's return value is sent as JSON (status `spec.status`, default 200);
 * returning `null` sends 204. A route `[id]` param that isn't a uuid answers 404, like a missing row.
 */
export function withStudent<B extends z.ZodType = z.ZodUndefined, Q extends z.ZodType = z.ZodUndefined>(
  spec: Spec<B, Q>,
  handler: (input: Input<z.output<B>, z.output<Q>>) => Promise<unknown>,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) return errorResponse("UNAUTHENTICATED", "Sign in to continue", requestId);
      if (req.method !== "GET" && req.headers.get("origin") !== ORIGIN) return errorResponse("FORBIDDEN_ORIGIN", "Request from another origin", requestId);

      const { id = "" } = (await ctx?.params) ?? {};
      if (id && !z.uuid().safeParse(id).success) return errorResponse("NOT_FOUND", "Not found", requestId);

      let rawBody: unknown;
      if (spec.body) {
        try {
          rawBody = await req.json();
        } catch {
          return errorResponse("VALIDATION", "The request body isn't valid JSON", requestId);
        }
      }
      const parse = (schema: z.ZodType | undefined, value: unknown) => (schema ? schema.safeParse(value) : { success: true as const, data: undefined });
      const body = parse(spec.body, rawBody);
      const query = parse(spec.query, Object.fromEntries(new URL(req.url).searchParams));
      for (const r of [body, query])
        if (!r.success) return errorResponse("VALIDATION", "Check the highlighted fields", requestId, { fieldErrors: fieldErrors(r.error) });

      const result = await handler({ studentId: session.user.id, body: body.data as z.output<B>, query: query.data as z.output<Q>, id });
      return result === null ? new Response(null, { status: 204 }) : Response.json(result, { status: spec.status ?? 200 });
    } catch (e) {
      if (e instanceof AppError) return errorResponse(e.code, e.message, requestId, e.extra);
      log.error("request failed", { requestId, method: req.method, path: new URL(req.url).pathname, error: e });
      return errorResponse("INTERNAL", "Something went wrong. Try again.", requestId);
    }
  };
}
