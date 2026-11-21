// The WhatsApp Link (design files 60, 61, 62): the only code that opens or closes the socket. It pairs by phone
// code, follows the disconnect table (§8), syncs group names, and feeds messages to Ingest. It never sends
// messages, presence or read receipts.
import makeWASocket, { jidNormalizedUser, makeCacheableSignalKeyStore, type WASocket } from "baileys";
import { eq } from "drizzle-orm";
import pino from "pino";
import { db } from "@/server/db/client";
import { healthSignal, waGroup, waSession } from "@/server/db/schema";
import { log } from "@/server/log";
import { raiseAlert } from "../scheduler/alerts";
import { loadAuthState, wipeAuth } from "./auth-store";
import { disconnectAction } from "./disconnect";
import type { Ingest } from "./ingest";

const PAIRING_TIMEOUT_MS = 3 * 60_000;
const GROUP_SYNC_MS = 6 * 3_600_000;
const DEVICE_LIMIT = "WhatsApp's linked-device limit is reached. Remove a device in WhatsApp → Linked devices, then try again.";

type Status = "unlinked" | "pairing" | "connected" | "logged_out" | "error";

export class WhatsAppLink {
  private sock: WASocket | null = null;
  private attempt = 0;
  private pairingPhone: string | null = null;
  private pairingTimer: NodeJS.Timeout | null = null;
  private groupTimer: NodeJS.Timeout | null = null;
  private generation = 0; // ignores events from a socket that has been replaced

  constructor(
    private readonly studentId: string,
    private readonly key: Buffer,
    private readonly ingest: Ingest,
  ) {}

  /** At startup: reconnect if a link exists. */
  async start() {
    const [s] = await db.select({ creds: waSession.credsEnc, status: waSession.status }).from(waSession).where(eq(waSession.studentId, this.studentId));
    if (s?.creds && s.status === "connected") await this.connect();
  }

  /** Pairing (file 61): fresh credentials, then a code for the phone number once the socket is connecting. */
  async startPairing(phone: string) {
    this.close();
    await wipeAuth(this.studentId);
    this.pairingPhone = phone;
    await this.setStatus("pairing", { pairingCode: null, lastError: null });
    this.pairingTimer = setTimeout(() => void this.failPairing("Pairing timed out; try again."), PAIRING_TIMEOUT_MS);
    await this.connect();
  }

  /** Unlinking from Settings: log out on WhatsApp's side too, then forget everything. */
  async unlink() {
    const sock = this.sock;
    this.close();
    await sock?.logout().catch(() => undefined);
    await wipeAuth(this.studentId);
    await this.setStatus("unlinked", { pairingCode: null, lastError: null, disconnectedAt: null });
    await this.health(true, "unlinked"); // deliberately unlinked counts as healthy (§10)
  }

  stop() {
    this.close();
  }

  private close() {
    this.generation++;
    if (this.pairingTimer) clearTimeout(this.pairingTimer);
    if (this.groupTimer) clearInterval(this.groupTimer);
    this.pairingTimer = this.groupTimer = null;
    this.sock?.end(undefined);
    this.sock = null;
  }

  private async connect() {
    const gen = ++this.generation;
    const auth = await loadAuthState(this.studentId, this.key);
    const logger = pino({ level: "warn" });
    const sock = makeWASocket({
      auth: { creds: auth.creds, keys: makeCacheableSignalKeyStore(auth.keys, logger) },
      logger,
      markOnlineOnConnect: false, // keeps notifications on the phone
      syncFullHistory: false,
      shouldSyncHistoryMessage: () => false, // no look-back
      shouldIgnoreJid: this.ingest.shouldIgnoreJid, // unlinked chats are dropped before decryption
    });
    this.sock = sock;
    const live = () => gen === this.generation;
    let codeRequested = false;

    sock.ev.on("creds.update", () => void auth.saveCreds());
    for (const event of ["messages.upsert", "messages.update", "messages.delete"] as const) {
      sock.ev.on(event, (payload: unknown) => {
        if (live()) this.ingest.handle(event, payload).catch((e) => log.error("ingest failed", { event, error: e }));
      });
    }

    sock.ev.on("connection.update", async (u) => {
      if (!live()) return;
      try {
        if (this.pairingPhone && !auth.creds.registered && !codeRequested && (u.connection === "connecting" || u.qr)) {
          codeRequested = true;
          const code = await sock.requestPairingCode(this.pairingPhone);
          await this.setStatus("pairing", { pairingCode: code });
        }
        if (u.connection === "open") await this.opened(sock);
        if (u.connection === "close") await this.closed((u.lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)?.output?.statusCode, u.lastDisconnect?.error?.message);
      } catch (e) {
        log.error("whatsapp connection handling failed", { error: e });
      }
    });
  }

  private async opened(sock: WASocket) {
    this.attempt = 0;
    this.pairingPhone = null;
    if (this.pairingTimer) clearTimeout(this.pairingTimer);
    this.pairingTimer = null;
    this.ingest.setOwnJids([sock.user?.id, sock.user?.lid].filter((j): j is string => !!j).map(jidNormalizedUser));
    await this.setStatus("connected", { pairingCode: null, lastError: null, lastConnectedAt: new Date(), disconnectedAt: null });
    await this.health(true);
    await this.syncGroups(sock);
    this.groupTimer = setInterval(() => void this.syncGroups(sock), GROUP_SYNC_MS);
  }

  private async closed(code: number | undefined, message: string | undefined) {
    const pairing = this.pairingPhone !== null;
    const action = disconnectAction(code, this.attempt);
    log.warn("whatsapp closed", { code, action: action.action });

    // While pairing, restartRequired is the normal next step; any other close ends the attempt with a readable error.
    if (pairing && !(action.action === "reconnect" && action.delayMs === 0)) {
      // shortcut: WhatsApp's exact signal for the linked-device limit isn't documented; this matches on the message.
      return this.failPairing(/limit|device/i.test(message ?? "") ? DEVICE_LIMIT : "Linking didn't finish. Check the code and try again.");
    }
    this.sock = null;
    if (action.action === "logged_out") {
      await wipeAuth(this.studentId);
      await this.setStatus("logged_out", { disconnectedAt: new Date(), lastError: "WhatsApp logged this device out. Link it again from Settings." });
      await this.health(false, "logged out");
      await raiseAlert(this.studentId, "whatsapp_logged_out", { code }, new Date());
    } else if (action.action === "replaced" || action.action === "mismatch") {
      await this.setStatus("error", { disconnectedAt: new Date(), lastError: action.action === "replaced" ? "Another copy of the app connected to WhatsApp." : "WhatsApp reported a multi-device mismatch." });
      await this.health(false, action.action);
      await raiseAlert(this.studentId, action.action === "replaced" ? "whatsapp_replaced" : "whatsapp_mismatch", { code }, new Date());
    } else {
      if (action.delayMs > 0) {
        this.attempt++;
        await this.health(false, `reconnecting after ${code}`);
      }
      const gen = this.generation;
      setTimeout(() => void (gen === this.generation && this.connect()), action.delayMs);
    }
  }

  private async failPairing(lastError: string) {
    this.close();
    this.pairingPhone = null;
    await wipeAuth(this.studentId);
    await this.setStatus("error", { pairingCode: null, lastError });
  }

  /** Group names (file 62): after pairing and every 6 hours. Links belong to the Student and aren't touched. */
  private async syncGroups(sock: WASocket) {
    try {
      const groups = Object.values(await sock.groupFetchAllParticipating());
      for (const g of groups) {
        await db
          .insert(waGroup)
          .values({ studentId: this.studentId, waJid: g.id, subject: g.subject || g.id })
          .onConflictDoUpdate({ target: [waGroup.studentId, waGroup.waJid], set: { subject: g.subject || g.id } });
      }
    } catch (e) {
      log.warn("group sync failed", { error: e });
    }
  }

  private setStatus(status: Status, extra: Partial<typeof waSession.$inferInsert> = {}) {
    return db.update(waSession).set({ status, ...extra }).where(eq(waSession.studentId, this.studentId));
  }

  private async health(ok: boolean, detail?: string) {
    const now = new Date();
    const set = ok ? { lastOkAt: now, detail: detail ?? null } : { lastErrorAt: now, detail: detail ?? null };
    await db.insert(healthSignal).values({ component: "wa_socket", ...set }).onConflictDoUpdate({ target: healthSignal.component, set });
  }
}
