// Health signals (design §10). wa_socket and ai, and the capture check, join with #11 and #12.
type Signal = { lastOkAt: Date | null; lastErrorAt: Date | null };
export type Signals = Partial<Record<"scheduler" | "email" | "wa_socket" | "ai" | "backup", Signal>>;

const after = (a: Date | null, b: Date | null) => !!a && (!b || +a > +b);

export function evaluateHealth(signals: Signals, now: Date) {
  const s = signals.scheduler;
  // Ticked within 3 minutes, and nothing failed since.
  const scheduler = !!s?.lastOkAt && +now - +s.lastOkAt <= 3 * 60_000 && (!s.lastErrorAt || +s.lastErrorAt <= +s.lastOkAt);
  // The last send succeeded, or none was attempted.
  const email = !signals.email?.lastErrorAt || after(signals.email.lastOkAt, signals.email.lastErrorAt);
  return {
    scheduler,
    email,
    pingReminders: scheduler && email,
    banners: scheduler ? [] : [{ kind: "worker_unhealthy" as const, since: s?.lastOkAt?.toISOString() ?? null }],
  };
}
