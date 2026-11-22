import { describe, expect, it } from "vitest";
import { evaluateHealth } from "@/server/domain/health";

const NOW = new Date("2026-11-20T10:00:00Z");
const ago = (min: number) => new Date(+NOW - min * 60_000);

describe("evaluateHealth", () => {
  it("calls the scheduler healthy when a full tick ran in the last 3 minutes; one failed tick doesn't trip it", () => {
    expect(evaluateHealth({ scheduler: { lastOkAt: ago(2), lastErrorAt: null } }, NOW).scheduler).toBe(true);
    expect(evaluateHealth({ scheduler: { lastOkAt: ago(4), lastErrorAt: null } }, NOW).scheduler).toBe(false);
    expect(evaluateHealth({ scheduler: { lastOkAt: ago(2), lastErrorAt: ago(1) } }, NOW).scheduler).toBe(true);
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

  describe("the AI and the capture check (#15)", () => {
    const base = { scheduler: { lastOkAt: ago(1), lastErrorAt: null }, wa_socket: { lastOkAt: ago(5), lastErrorAt: null }, ai: { lastOkAt: ago(1), lastErrorAt: null } };
    const ai = (oldestWaitingMs: number | null, paused = false) => ({ oldestWaitingMs, paused });

    it("pings capture while WhatsApp and the AI are healthy; a message waiting over 30 minutes or a stopped AI loop stops it", () => {
      expect(evaluateHealth(base, NOW, ai(29 * 60_000)).pingCapture).toBe(true);
      expect(evaluateHealth(base, NOW, ai(31 * 60_000)).pingCapture).toBe(false);
      expect(evaluateHealth({ ...base, ai: { lastOkAt: ago(10), lastErrorAt: ago(5) } }, NOW, ai(null)).pingCapture).toBe(false);
      expect(evaluateHealth({ ...base, wa_socket: { lastOkAt: ago(10), lastErrorAt: ago(5) } }, NOW, ai(null)).pingCapture).toBe(false);
    });

    it("stays healthy while paused, however long messages wait, and shows the paused banner instead of the AI one", () => {
      const paused = evaluateHealth({ ...base, ai: { lastOkAt: ago(10), lastErrorAt: ago(5) } }, NOW, ai(5 * 3_600_000, true));
      expect(paused).toMatchObject({ pingCapture: true, banners: [{ kind: "auto_changes_paused" }] });
    });

    it("shows the AI banner when the AI is unhealthy, after the worker banner, at most two", () => {
      expect(evaluateHealth(base, NOW, ai(31 * 60_000)).banners).toEqual([{ kind: "ai_unavailable", since: ago(31).toISOString() }]);
      const stale = { ...base, scheduler: { lastOkAt: ago(10), lastErrorAt: null } };
      expect(evaluateHealth(stale, NOW, ai(31 * 60_000)).banners.map((b) => b.kind)).toEqual(["worker_unhealthy", "ai_unavailable"]);
    });
  });
});
