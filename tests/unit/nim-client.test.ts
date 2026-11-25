import { describe, expect, it } from "vitest";
import { MAX_TOKENS, NIM_TIMEOUT_MS } from "@/worker/ai/nim-client";

describe("the NIM call limit (U40, #67)", () => {
  it("lets a full max_tokens answer finish at 25 tokens a second", () => {
    // Measured on the VM: about 63 tokens/s; 25 leaves room for a busy NIM.
    expect(NIM_TIMEOUT_MS).toBeGreaterThanOrEqual((MAX_TOKENS / 25) * 1000);
  });
  it("leaves two calls (a try and its repair) inside the 10-minute stale reset", () => {
    expect(2 * NIM_TIMEOUT_MS).toBeLessThan(10 * 60_000);
  });
});
