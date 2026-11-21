// The AI client (design file 64): NVIDIA NIM's OpenAI-compatible chat API over fetch, temperature 0, 60 s timeout.
// 401/403 are fatal (the AI loop stops and alerts); 429, 5xx and timeouts are retryable.
export class AiFatalError extends Error {}
export class AiRetryableError extends Error {}

export type Chat = { role: "system" | "user" | "assistant"; content: string }[];
export type AiReply = { content: string; inputTokens: number; outputTokens: number };
export type AiClient = { model: string; complete(messages: Chat): Promise<AiReply> };

export function nimClient(model = process.env.NIM_MODEL ?? "", apiKey = process.env.NIM_API_KEY ?? "", base = process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1"): AiClient {
  const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
  return {
    model,
    async complete(messages) {
      let res: Response;
      try {
        res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, messages, temperature: 0, max_tokens: 4096, response_format: { type: "json_object" } }),
          signal: AbortSignal.timeout(60_000),
        });
      } catch (e) {
        throw new AiRetryableError(`NIM unreachable: ${(e as Error).message}`);
      }
      if (res.status === 401 || res.status === 403) throw new AiFatalError(`NIM refused the key (${res.status})`);
      if (res.status === 429 || res.status >= 500) throw new AiRetryableError(`NIM ${res.status}`);
      // Any other 4xx is a request NIM will never accept (a wrong model name, too long a context): retrying won't help.
      if (!res.ok) throw new Error(`NIM ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const j = (await res.json()) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      return { content: j.choices?.[0]?.message?.content ?? "", inputTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 };
    },
  };
}

/** The AI loop's startup check: the key works and the pinned model is listed (design §8). */
export async function checkModel(model = process.env.NIM_MODEL, apiKey = process.env.NIM_API_KEY, base = process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1") {
  if (!model || !apiKey) throw new Error("NIM_MODEL and NIM_API_KEY must be set");
  const res = await fetch(`${base}/models`, { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`NIM /models answered ${res.status}`);
  const ids = ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
  if (!ids.includes(model)) throw new Error(`NIM_MODEL ${model} isn't listed by NIM`);
}
