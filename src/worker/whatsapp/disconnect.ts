// What to do when the WhatsApp connection closes (design §8). Codes are Baileys' DisconnectReason values.
const BACKOFF_MS = [5_000, 30_000, 120_000, 300_000];

export type DisconnectAction = { action: "logged_out" } | { action: "replaced" } | { action: "mismatch" } | { action: "reconnect"; delayMs: number };

export function disconnectAction(code: number | undefined, attempt: number): DisconnectAction {
  switch (code) {
    case 401: // loggedOut
    case 403: // forbidden
    // 500 (badSession) is not here: Baileys reports any unknown stream error as 500, so it reconnects (U39).
      return { action: "logged_out" };
    case 440: // connectionReplaced: another instance is connected
      return { action: "replaced" };
    case 411: // multideviceMismatch
      return { action: "mismatch" };
    case 515: // restartRequired: the normal step right after pairing
      return { action: "reconnect", delayMs: 0 };
    default:
      return { action: "reconnect", delayMs: BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]! };
  }
}
