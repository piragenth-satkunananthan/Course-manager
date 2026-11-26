// Which NVIDIA NIM key and model are used (U45, #81): the Student's saved ones (key stored encrypted with the data
// key), otherwise the server's from its environment. Read on each use, so a change applies without a restart.
export type NimConfig = { apiKey: string; model: string; base: string; keySource: "saved" | "server" };
type Env = Record<string, string | undefined>;

export function pickNim(saved: { apiKey: string | null; model: string | null }, env: Env = process.env): NimConfig {
  return {
    apiKey: saved.apiKey ?? env.NIM_API_KEY ?? "",
    model: saved.model ?? env.NIM_MODEL ?? "",
    base: env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
    keySource: saved.apiKey ? "saved" : "server",
  };
}

/** "••••abcd": the only form of a key that ever leaves the server. */
export const maskKey = (key: string) => (key ? `••••${key.slice(-4)}` : null);
