// The AI section in Settings (#80): whether the AI is working, delayed, stopped or paused, in plain words.
const WAIT_LIMIT_MS = 30 * 60_000; // the same limit as the "Auto Changes are delayed" banner (design §10)

export type AiStatusInput = {
  signal: { lastOkAt: Date | null; lastErrorAt: Date | null; detail: string | null } | undefined;
  paused: boolean;
  oldestWaitingMs: number | null;
  waiting: number;
  lastSuccessAt: Date | null;
  lastBatchError: string | null;
};
export type AiState = "working" | "delayed" | "stopped" | "paused";

/** NIM's technical errors as the Student reads them. */
export function plainAiError(e: string) {
  if (/refused the key|\b40[13]\b/.test(e)) return "NVIDIA refused the API key";
  if (/timeout|timed out/i.test(e)) return "NVIDIA didn't answer in time";
  if (/unreachable/i.test(e)) return "The server couldn't reach NVIDIA";
  if (/\b429\b/.test(e)) return "NVIDIA is busy (too many requests)";
  if (/\b404\b|pinned model/.test(e)) return "NVIDIA doesn't offer the chosen model";
  if (/\b5\d\d\b/.test(e)) return "NVIDIA's service had an error";
  if (/must be set/.test(e)) return "No API key or model is set on the server";
  return e;
}

export function aiStatus(i: AiStatusInput): { state: AiState; lastSuccessAt: string | null; waiting: number; problem: string | null } {
  const out = (state: AiState, problem: string | null) => ({ state, lastSuccessAt: i.lastSuccessAt?.toISOString() ?? null, waiting: i.waiting, problem });
  if (i.paused) return out("paused", null);
  if (!i.signal) return out("stopped", "The AI hasn't started on the server");
  const { lastOkAt, lastErrorAt, detail } = i.signal;
  if (lastErrorAt && (!lastOkAt || +lastErrorAt > +lastOkAt)) return out("stopped", detail ? plainAiError(detail) : "The AI stopped on the server");
  if (i.oldestWaitingMs !== null && i.oldestWaitingMs > WAIT_LIMIT_MS) return out("delayed", i.lastBatchError ? plainAiError(i.lastBatchError) : "Messages are waiting longer than usual");
  return out("working", null);
}
