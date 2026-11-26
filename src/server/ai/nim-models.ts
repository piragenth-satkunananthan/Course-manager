// The model ids an NVIDIA NIM key can use (#81): checks a key before it's saved and lists models in Settings. A
// result is kept for a minute per key, so reloading Settings or retrying doesn't call NVIDIA each time.
import { createHash } from "node:crypto";
import { invalid } from "@/server/http/errors";
import type { NimConfig } from "./nim-config";

const cache = new Map<string, { at: number; models: string[] | null }>();
const TTL_MS = 60_000;

/** The models the key can use, sorted, or null when NVIDIA refuses the key. */
export async function modelsFor(c: Pick<NimConfig, "apiKey" | "base">): Promise<string[] | null> {
  const id = createHash("sha256").update(`${c.base}\n${c.apiKey}`).digest("hex"); // never keep the key itself
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.models;
  let res: Response;
  try {
    res = await fetch(`${c.base}/models`, { headers: { authorization: `Bearer ${c.apiKey}` }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw invalid("apiKey", "Couldn't reach NVIDIA to check the key. Try again.");
  }
  if (!res.ok && res.status !== 401 && res.status !== 403) throw invalid("apiKey", "NVIDIA couldn't check the key just now. Try again.");
  const models = res.ok ? ((await res.json()) as { data: { id: string }[] }).data.map((m) => m.id).sort() : null;
  cache.set(id, { at: Date.now(), models });
  return models;
}
