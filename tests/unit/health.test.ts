import { describe, expect, it } from "vitest";
import { evaluateHealth } from "@/server/domain/health";

const NOW = new Date("2026-11-20T10:00:00Z");
const ago = (min: number) => new Date(+NOW - min * 60_000);

describe("evaluateHealth", () => {
  it("calls the scheduler healthy when it ticked in the last 3 minutes without a later error", () => {
    expect(evaluateHealth({ scheduler: { lastOkAt: ago(2), lastErrorAt: null } }, NOW).scheduler).toBe(true);
    expect(evaluateHealth({ scheduler: { lastOkAt: ago(4), lastErrorAt: null } }, NOW).scheduler).toBe(false);
    expect(evaluateHealth({ scheduler: { lastOkAt: ago(2), lastErrorAt: ago(1) } }, NOW).scheduler).toBe(false);
    expect(evaluateHealth({}, NOW).scheduler).toBe(false);
  });

  it("calls email healthy when the last send succeeded or nothing was sent yet", () => {
    expect(evaluateHealth({}, NOW).email).toBe(true);
    expect(evaluateHealth({ email: { lastOkAt: ago(30), lastErrorAt: ago(60) } }, NOW).email).toBe(true);
    expect(evaluateHealth({ email: { lastOkAt: ago(60), lastErrorAt: ago(30) } }, NOW).email).toBe(false);
  });

  it("pings the reminders check only when both are healthy, and raises the worker banner when the scheduler isn't", () => {
    const ok = evaluateHealth({ scheduler: { lastOkAt: ago(1), lastErrorAt: null } }, NOW);
    expect(ok).toMatchObject({ pingReminders: true, banners: [] });
    const stale = evaluateHealth({ scheduler: { lastOkAt: ago(10), lastErrorAt: null } }, NOW);
    expect(stale).toMatchObject({ pingReminders: false, banners: [{ kind: "worker_unhealthy", since: ago(10).toISOString() }] });
    const mailDown = evaluateHealth({ scheduler: { lastOkAt: ago(1), lastErrorAt: null }, email: { lastOkAt: null, lastErrorAt: ago(1) } }, NOW);
    expect(mailDown.pingReminders).toBe(false);
  });
});
