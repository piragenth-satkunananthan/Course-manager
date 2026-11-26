// "Test AI now" (#80): one short call to NVIDIA NIM with the server's key and model. Changes nothing.
import { plainAiError } from "@/server/domain/ai-status";
import { AppError } from "@/server/http/errors";
import { withStudent } from "@/server/http/with-student";
import { pingNim } from "@/server/ai/nim-ping";
import { getNimConfig } from "@/server/data/nim";
import type { AiTestResult } from "@/shared/schemas/ai";

const last = new Map<string, number>(); // shortcut: per web process, which is fine with one web container
export const POST = withStudent({}, async ({ studentId }): Promise<AiTestResult> => {
  const now = Date.now();
  // 10 s between tests; e2e sets it to 0, since its specs test one after another as the same Student.
  if (now - (last.get(studentId) ?? 0) < Number(process.env.AI_TEST_MIN_INTERVAL_MS ?? 10_000)) throw new AppError("RATE_LIMITED", "Wait a few seconds before testing again");
  last.set(studentId, now);
  const config = await getNimConfig(studentId);
  try {
    return { ok: true as const, ...(await pingNim(config)) };
  } catch (e) {
    return { ok: false as const, problem: plainAiError((e as Error).message), model: config.model || null };
  }
});
