// The Student's NVIDIA NIM key and model (U45, #81; ADR-0007). The key is encrypted with the data key and never
// leaves the server except as ••••last4. Every NIM call (worker, Test AI now) reads the config fresh.
import { eq } from "drizzle-orm";
import { decrypt, encrypt, loadKey } from "@/server/crypto";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { maskKey, type NimConfig, pickNim } from "@/server/ai/nim-config";
import { invalid } from "@/server/http/errors";
import type { AiKeyView } from "@/shared/schemas/ai";

export async function getNimConfig(studentId: string): Promise<NimConfig> {
  const [row] = await db.select({ enc: user.nimApiKeyEnc, model: user.nimModel }).from(user).where(eq(user.id, studentId));
  return pickNim({ apiKey: row?.enc ? decrypt(row.enc, loadKey()) : null, model: row?.model ?? null });
}

/** The worker serves one Student (v1): their config, or the server's when there's no account yet. */
export async function getWorkerNimConfig(): Promise<NimConfig> {
  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  return row ? getNimConfig(row.id) : pickNim({ apiKey: null, model: null });
}

export async function getAiKeyView(studentId: string): Promise<AiKeyView> {
  const [c, [row]] = await Promise.all([getNimConfig(studentId), db.select({ previous: user.nimModelPrevious }).from(user).where(eq(user.id, studentId))]);
  return { keySource: c.keySource, keyMasked: maskKey(c.apiKey), model: c.model || null, previousModel: row?.previous ?? null };
}

/** The model ids a key can use, or null when NVIDIA refuses the key. */
async function modelsFor(c: Pick<NimConfig, "apiKey" | "base">): Promise<string[] | null> {
  let res: Response;
  try {
    res = await fetch(`${c.base}/models`, { headers: { authorization: `Bearer ${c.apiKey}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw invalid("apiKey", "Couldn't reach NVIDIA to check the key. Try again.");
  }
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw invalid("apiKey", "NVIDIA couldn't check the key just now. Try again.");
  return ((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id).sort();
}

export async function saveNimKey(studentId: string, apiKey: string): Promise<AiKeyView> {
  const c = await getNimConfig(studentId);
  if (!(await modelsFor({ apiKey, base: c.base }))) throw invalid("apiKey", "NVIDIA refused this key");
  await db.update(user).set({ nimApiKeyEnc: encrypt(apiKey, loadKey()) }).where(eq(user.id, studentId));
  return getAiKeyView(studentId);
}

export async function clearNimKey(studentId: string): Promise<AiKeyView> {
  await db.update(user).set({ nimApiKeyEnc: null }).where(eq(user.id, studentId));
  return getAiKeyView(studentId);
}

export async function listNimModels(studentId: string) {
  const c = await getNimConfig(studentId);
  return { models: (await modelsFor(c)) ?? [], current: c.model || null };
}

export async function setNimModel(studentId: string, model: string): Promise<AiKeyView> {
  const c = await getNimConfig(studentId);
  const models = await modelsFor(c);
  if (!models?.includes(model)) throw invalid("model", "Your key can't use that model");
  if (model !== c.model) await db.update(user).set({ nimModel: model, nimModelPrevious: c.model || null }).where(eq(user.id, studentId));
  return getAiKeyView(studentId);
}
