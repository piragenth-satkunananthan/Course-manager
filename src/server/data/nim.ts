// The Student's NVIDIA NIM key and model (U45, #81; ADR-0007). The key is encrypted with the data key and never
// leaves the server except as ••••last4. Every NIM call (worker, Test AI now) reads the config fresh.
import { eq } from "drizzle-orm";
import { decrypt, encrypt, loadKey } from "@/server/crypto";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
import { maskKey, type NimConfig, pickNim } from "@/server/ai/nim-config";
import { modelsFor } from "@/server/ai/nim-models";
import { AppError, invalid } from "@/server/http/errors";
import { log } from "@/server/log";
import type { AiKeyView } from "@/shared/schemas/ai";

export async function getNimConfig(studentId: string): Promise<NimConfig> {
  const [row] = await db.select({ enc: user.nimApiKeyEnc, model: user.nimModel }).from(user).where(eq(user.id, studentId));
  let apiKey: string | null = null;
  try {
    apiKey = row?.enc ? decrypt(row.enc, loadKey()) : null;
  } catch {
    // A key saved under another data key, or damaged: use the server's, so Settings still opens and it can be replaced.
    log.warn("saved NIM key can't be decrypted; using the server's");
  }
  return pickNim({ apiKey, model: row?.model ?? null });
}

/** The worker serves one Student (v1): their config, or the server's when there's no account yet. shortcut: the first user; give the worker a Student per batch when friends are added. */
export async function getWorkerNimConfig(): Promise<NimConfig> {
  const [row] = await db.select({ id: user.id }).from(user).limit(1);
  return row ? getNimConfig(row.id) : pickNim({ apiKey: null, model: null });
}

export async function getAiKeyView(studentId: string): Promise<AiKeyView> {
  const [c, [row]] = await Promise.all([getNimConfig(studentId), db.select({ previous: user.nimModelPrevious }).from(user).where(eq(user.id, studentId))]);
  // Only the Student's own key is shown, as ••••last4; nothing of the server's key reaches the page (ADR-0007).
  return { keySource: c.keySource, keyMasked: c.keySource === "saved" ? maskKey(c.apiKey) : null, model: c.model || null, previousModel: row?.previous ?? null };
}

// At most 5 key or model saves a minute per Student: each calls NVIDIA. shortcut: per web process (one web container).
const saves = new Map<string, number[]>();
function limitSaves(studentId: string) {
  const now = Date.now();
  const recent = (saves.get(studentId) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= 5) throw new AppError("RATE_LIMITED", "Too many changes. Wait a minute and try again.");
  saves.set(studentId, [...recent, now]);
}

/** Saves a key NVIDIA accepts. If it can't use the chosen model, the model goes back to the server's (product owner, 2026-11-26). */
export async function saveNimKey(studentId: string, apiKey: string): Promise<AiKeyView & { modelReset?: string }> {
  limitSaves(studentId);
  const c = await getNimConfig(studentId);
  const models = await modelsFor({ apiKey, base: c.base });
  if (!models) throw invalid("apiKey", "NVIDIA refused this key");
  const [row] = await db.select({ model: user.nimModel }).from(user).where(eq(user.id, studentId));
  const reset = row?.model && !models.includes(row.model) ? row.model : undefined;
  await db
    .update(user)
    .set({ nimApiKeyEnc: encrypt(apiKey, loadKey()), ...(reset && { nimModel: null, nimModelPrevious: reset }) })
    .where(eq(user.id, studentId));
  return { ...(await getAiKeyView(studentId)), ...(reset && { modelReset: reset }) };
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
  limitSaves(studentId);
  const c = await getNimConfig(studentId);
  const models = await modelsFor(c);
  if (!models?.includes(model)) throw invalid("model", "Your key can't use that model");
  if (model !== c.model) await db.update(user).set({ nimModel: model, nimModelPrevious: c.model || null }).where(eq(user.id, studentId));
  return getAiKeyView(studentId);
}
