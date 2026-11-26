import * as z from "zod";

// Settings → AI (#80): the status the page shows and the result of "Test AI now".
export const AiState = z.enum(["working", "delayed", "stopped", "paused"]);
export type AiState = z.infer<typeof AiState>;
export const AiStatus = z.object({
  state: AiState,
  lastSuccessAt: z.string().nullable(),
  waiting: z.number(),
  problem: z.string().nullable(), // why it isn't working now
  lastError: z.string().nullable(), // the last batch error in the past 24 hours, even while working
  model: z.string().nullable(),
});
export type AiStatus = z.infer<typeof AiStatus>;
export const AiTestResult = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(true), ms: z.number(), model: z.string() }),
  z.object({ ok: z.literal(false), problem: z.string(), model: z.string().nullable() }),
]);
export type AiTestResult = z.infer<typeof AiTestResult>;
