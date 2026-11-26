import { describe, expect, it } from "vitest";
import { aiStatus, plainAiError } from "@/server/domain/ai-status";

const NOW = new Date("2026-11-26T06:00:00Z");
const ago = (min: number) => new Date(+NOW - min * 60_000);
const base = { signal: { lastOkAt: ago(1), lastErrorAt: null, detail: null }, paused: false, oldestWaitingMs: null, waiting: 0, lastSuccessAt: ago(40), lastBatchError: null };

describe("aiStatus (#80)", () => {
  it("is working when the loop runs and nothing waits over 30 minutes", () => {
    expect(aiStatus(base)).toEqual({ state: "working", lastSuccessAt: ago(40).toISOString(), waiting: 0, problem: null });
    expect(aiStatus({ ...base, waiting: 3, oldestWaitingMs: 30 * 60_000 }).state).toBe("working");
  });

  it("is delayed when a message has waited over 30 minutes, with the last batch's error in plain words", () => {
    const s = aiStatus({ ...base, waiting: 1, oldestWaitingMs: 31 * 60_000, lastBatchError: "NIM unreachable: The operation was aborted due to timeout" });
    expect(s).toMatchObject({ state: "delayed", waiting: 1, problem: "NVIDIA didn't answer in time" });
  });

  it("is stopped when the AI loop's last signal is an error, which wins over delayed", () => {
    const s = aiStatus({ ...base, signal: { lastOkAt: ago(20), lastErrorAt: ago(5), detail: "NIM refused the key (401)" }, oldestWaitingMs: 60 * 60_000, waiting: 2 });
    expect(s).toMatchObject({ state: "stopped", problem: "NVIDIA refused the API key" });
  });

  it("is paused when Auto Changes are off, whatever else is happening", () => {
    expect(aiStatus({ ...base, paused: true, oldestWaitingMs: 90 * 60_000 }).state).toBe("paused");
  });

  it("is stopped with no signal at all (the loop never started)", () => {
    expect(aiStatus({ ...base, signal: undefined })).toMatchObject({ state: "stopped", problem: "The AI hasn't started on the server" });
  });

  it("explains NIM errors in plain words", () => {
    expect(["NIM 429", "NIM 503", "NIM doesn't offer the pinned model (404)", "NIM_MODEL and NIM_API_KEY must be set", "something odd"].map(plainAiError)).toEqual([
      "NVIDIA is busy (too many requests)",
      "NVIDIA's service had an error",
      "NVIDIA doesn't offer the chosen model",
      "No API key or model is set on the server",
      "something odd",
    ]);
  });
});
