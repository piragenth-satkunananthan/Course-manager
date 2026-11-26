// "Test AI now" (#80): one tiny chat with the server's NIM key and model, from the web app. It writes nothing.
// Errors use the same wording as the worker's NIM client, so plainAiError reads both.
export async function pingNim(timeoutMs = Number(process.env.NIM_TEST_TIMEOUT_MS ?? 10_000)) {
  const model = process.env.NIM_MODEL ?? "";
  const apiKey = process.env.NIM_API_KEY ?? "";
  if (!model || !apiKey) throw new Error("NIM_MODEL and NIM_API_KEY must be set");
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${process.env.NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with OK." }], max_tokens: 16, temperature: 0 }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new Error(`NIM unreachable: ${(e as Error).name === "TimeoutError" ? "timeout" : "no connection"}`);
  }
  if (res.status === 401 || res.status === 403) throw new Error(`NIM refused the key (${res.status})`);
  if (res.status === 404) throw new Error("NIM doesn't offer the pinned model (404)");
  if (!res.ok) throw new Error(`NIM ${res.status}`);
  return { ms: Date.now() - started, model };
}
