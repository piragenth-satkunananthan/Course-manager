// Health signals (design §10). wa_socket and ai, and the capture check, join with #11 and #12.
type Signal = { lastOkAt: Date | null; lastErrorAt: Date | null };
export type Signals = Partial<Record<"scheduler" | "email" | "wa_socket" | "ai" | "backup", Signal>>;

const SCHEDULER_STALE_MS = 3 * 60_000;
const isLater = (a: Date | null, b: Date | null) => !!a && (!b || +a > +b);

/** `oldestWaitingMs`: how long the oldest pending or processing message has waited; `paused`: Auto Changes are off. */
export function evaluateHealth(signals: Signals, now: Date, ai: { oldestWaitingMs: number | null; paused: boolean } = { oldestWaitingMs: null, paused: false }) {
  const s = signals.scheduler;
  // §10: ticked within the last 3 minutes. Only a tick where every job ran refreshes lastOkAt, so a job that keeps
  // failing turns this unhealthy after 3 minutes, while one bad tick doesn't.
  const scheduler = !!s?.lastOkAt && +now - +s.lastOkAt <= SCHEDULER_STALE_MS;
  // The last send succeeded, or none was attempted.
  const email = !signals.email?.lastErrorAt || isLater(signals.email.lastOkAt, signals.email.lastErrorAt);
  // wa_socket: connected, or deliberately unlinked (both record lastOkAt). ai: nothing waits over 30 minutes, or paused.
  const waSocket = isLater(signals.wa_socket?.lastOkAt ?? null, signals.wa_socket?.lastErrorAt ?? null);
  const aiOk = ai.paused || ai.oldestWaitingMs === null || ai.oldestWaitingMs <= 30 * 60_000;
  return {
    scheduler,
    email,
    pingReminders: scheduler && email,
    pingCapture: waSocket && aiOk,
    banners: scheduler ? [] : [{ kind: "worker_unhealthy" as const, since: s?.lastOkAt?.toISOString() ?? null }],
  };
}
