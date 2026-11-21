import { describe, expect, it } from "vitest";
import { disconnectAction } from "@/worker/whatsapp/disconnect";

describe("disconnectAction (design §8 table)", () => {
  it("logs out and wipes on loggedOut, badSession and forbidden", () => {
    for (const code of [401, 500, 403]) expect(disconnectAction(code, 0)).toEqual({ action: "logged_out" });
  });
  it("stops without reconnecting when replaced or on a multidevice mismatch", () => {
    expect(disconnectAction(440, 0)).toEqual({ action: "replaced" });
    expect(disconnectAction(411, 0)).toEqual({ action: "mismatch" });
  });
  it("reconnects at once after restartRequired, otherwise with backoff 5 s, 30 s, 2 min, then every 5 min", () => {
    expect(disconnectAction(515, 3)).toEqual({ action: "reconnect", delayMs: 0 });
    expect([0, 1, 2, 3, 9].map((n) => disconnectAction(428, n))).toEqual(
      [5_000, 30_000, 120_000, 300_000, 300_000].map((delayMs) => ({ action: "reconnect", delayMs })),
    );
    expect(disconnectAction(undefined, 0)).toEqual({ action: "reconnect", delayMs: 5_000 });
  });
});
