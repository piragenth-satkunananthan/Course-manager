# NVIDIA NIM is the AI provider

The AI reads group messages and returns operations (ops.v1). It runs on NVIDIA NIM's hosted API, which has a free tier for development, through its OpenAI-compatible chat-completions endpoint with `temperature: 0` and JSON mode. The pinned model is `nvidia/nemotron-3-ultra-550b-a55b`, chosen in M0 (`docs/m0-report.md`): the smaller and other hosted models tried produced invalid JSON or timed out.

## Considered Options

- **A paid provider (OpenAI, Anthropic)**: not needed while NIM's free tier covers one Student's groups; kept as the fallback below.
- **A self-hosted model on the VM**: impossible in 1 GB of RAM (ADR-0001).

## Consequences

- The model, the prompt (`PROMPT_VERSION`) and the output schema are versioned together. Any change re-runs `npm run ai-eval` (on the held-out half of the private set once it exists; synthetic cases until then), which must pass 100% of deadline cases and at least 95% overall.
- NIM's free limits haven't been measured yet (`docs/m0-report.md`, item 10). In use so far, the free tier answers 429 under bursts and sometimes times out: messages stay pending and are retried at 1, 5, 15 and 60 minutes, then hourly, never dropped; an hour of failures alerts. A refused key or a retired model stops only the AI loop and alerts (design §8).
- **Fallback:** any OpenAI-compatible provider, by changing `NIM_BASE_URL`, `NIM_MODEL` and `NIM_API_KEY`, after the evaluation passes on the new model. A paid provider costs money.
- Message text goes to NVIDIA for processing. The product owner confirmed classmates and lecturers accept this, and each group has a pinned notice (ADR-0006).
