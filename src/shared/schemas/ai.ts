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

// #81 (U45): the key is only ever sent in; what comes back is its masked form.
export const AiKeyUpdate = z.strictObject({ apiKey: z.string({ error: "Paste your NVIDIA API key" }).trim().min(8, "Paste your NVIDIA API key").max(400, "That key is too long") });
export const AiModelUpdate = z.strictObject({ model: z.string({ error: "Choose a model" }).min(1, "Choose a model").max(200, "Choose a model") });
export const AiKeyView = z.object({ keySource: z.enum(["saved", "server"]), keyMasked: z.string().nullable(), model: z.string().nullable(), previousModel: z.string().nullable() });
export type AiKeyView = z.infer<typeof AiKeyView>;
export const AiModels = z.object({ models: z.array(z.string()), current: z.string().nullable() });
