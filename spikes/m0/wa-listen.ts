// M0 spike (#3): read-only WhatsApp listener. Throwaway; the app never imports it.
// It never sends messages, presence or read receipts. See spikes/m0/README.md.
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import makeWASocket, { DisconnectReason, jidNormalizedUser, useMultiFileAuthState } from "baileys";
import pino from "pino";
import { classify } from "./classify.ts";
import { encryptLine, loadKey } from "./crypto.ts";

const DATA = process.env.SPIKE_DATA_DIR ?? "spikes/m0/data";
const PHONE = (process.env.WA_PHONE ?? "").replace(/\D/g, ""); // digits incl. country code, e.g. 94771234567
const key = loadKey(process.env.DATA_ENCRYPTION_KEY);
if (!PHONE && !existsSync(join(DATA, "auth", "creds.json"))) throw new Error("WA_PHONE is not set; it is needed to pair");
mkdirSync(DATA, { recursive: true });

const now = () => new Date().toISOString();
const log = (event: string, data: object = {}) => {
  const line = JSON.stringify({ ts: now(), event, ...data });
  appendFileSync(join(DATA, "events.jsonl"), line + "\n");
  console.log(line);
};

// Linked groups come from a file, re-read every 30 s so a group can be linked mid-run (late-link test).
const GROUPS_FILE = join(DATA, "groups.txt");
let linked = new Set<string>();
const loadGroups = () => {
  const next = new Set(
    existsSync(GROUPS_FILE)
      ? readFileSync(GROUPS_FILE, "utf8").split("\n").map((l) => l.replace(/#.*/, "").trim()).filter((l) => l.endsWith("@g.us"))
      : [],
  );
  const added = [...next].filter((g) => !linked.has(g));
  if (added.length || next.size !== linked.size) log("groups_loaded", { count: next.size, added });
  linked = next;
};
loadGroups();
setInterval(loadGroups, 30_000).unref();

// Memory every 5 minutes.
const MEM = join(DATA, "memory.csv");
if (!existsSync(MEM)) writeFileSync(MEM, "ts,rss_mb,heap_used_mb\n");
const sampleMemory = () => {
  const m = process.memoryUsage();
  appendFileSync(MEM, `${now()},${(m.rss / 2 ** 20).toFixed(1)},${(m.heapUsed / 2 ** 20).toFixed(1)}\n`);
};
sampleMemory();
setInterval(sampleMemory, 5 * 60_000);

// Event shapes for the edit/delete test, with message text replaced by its length.
const redact = (v: any): any =>
  Array.isArray(v) ? v.map(redact)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) =>
      [k, typeof x === "string" && /^(conversation|text|caption|pushName)$/.test(k) ? `<redacted ${x.length} chars>` : redact(x)]))
  : typeof v === "bigint" ? String(v) : v;

const own = new Set<string>();
const BACKOFF = [5, 30, 120, 300];
let attempt = 0;

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(join(DATA, "auth"));
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "warn" }),
    markOnlineOnConnect: false, // keeps notifications on the phone
    syncFullHistory: false,
    shouldSyncHistoryMessage: () => false, // no look-back
    // Unlinked chats are dropped inside Baileys, before decryption. Own JID is kept for protocol messages.
    shouldIgnoreJid: (jid) => !own.has(jid) && !linked.has(jid),
  });
  sock.ev.on("creds.update", saveCreds);

  let pairingRequested = false;
  sock.ev.on("connection.update", async (u) => {
    if (!sock.authState.creds.registered && !pairingRequested && (u.connection === "connecting" || u.qr)) {
      pairingRequested = true;
      const code = await sock.requestPairingCode(PHONE);
      log("pairing_code", { code, hint: "WhatsApp → Linked devices → Link with phone number" });
    }
    if (u.connection === "open") {
      attempt = 0;
      for (const j of [sock.user?.id, sock.user?.lid]) if (j) own.add(jidNormalizedUser(j));
      log("connection", { connection: "open", isNewLogin: u.isNewLogin ?? false });
      const groups = await sock.groupFetchAllParticipating();
      writeFileSync(join(DATA, "all-groups.tsv"), Object.values(groups).map((g) => `${g.id}\t${g.subject}`).join("\n") + "\n");
    }
    if (u.receivedPendingNotifications) log("offline_catch_up_done");
    if (u.connection === "close") {
      const code = (u.lastDisconnect?.error as any)?.output?.statusCode as number | undefined;
      const reason = code === undefined ? "unknown" : DisconnectReason[code] ?? String(code);
      log("connection", { connection: "close", code, reason, message: u.lastDisconnect?.error?.message });
      if (code === DisconnectReason.loggedOut) {
        rmSync(join(DATA, "auth"), { recursive: true, force: true });
        log("logged_out", { next: "auth wiped; run the listener again to pair" });
        process.exit(0);
      }
      if (code === DisconnectReason.connectionReplaced) process.exit(0); // another instance is running
      const delay = code === DisconnectReason.restartRequired ? 0 : BACKOFF[Math.min(attempt++, BACKOFF.length - 1)];
      setTimeout(() => start().catch(crash), delay * 1000);
    }
  });

  const MESSAGES = join(DATA, "messages.enc.jsonl");
  const handle = (event: string) => (payload: any) => {
    const records = classify(event, payload, linked);
    for (const { text, sender, ...meta } of records) {
      const enc = encryptLine(JSON.stringify({ sender, text }), key);
      appendFileSync(MESSAGES, JSON.stringify({ ...meta, receivedAt: now(), enc }) + "\n");
      if (meta.type === "undecryptable") log("decrypt_failure", meta);
    }
    if (event === "messages.upsert" && records.length) log("upsert", { type: payload.type, count: records.length });
    // Raw shapes (text redacted) for every edit/revoke/delete in a linked group, own messages included.
    if (event !== "messages.upsert") {
      const relevant = event === "messages.delete"
        ? ((payload.keys ?? [{ remoteJid: payload.jid }]).some((k: any) => linked.has(k.remoteJid)) ? [payload] : [])
        : payload.filter((u: any) => linked.has(u.key?.remoteJid) && (u.update?.message?.editedMessage || u.update?.messageStubType != null));
      if (relevant.length) log("raw_shape", { source: event, payload: redact(relevant) });
    }
  };
  sock.ev.on("messages.upsert", handle("messages.upsert"));
  sock.ev.on("messages.update", handle("messages.update"));
  sock.ev.on("messages.delete", handle("messages.delete"));
}

const crash = (e: unknown) => {
  log("crash", { message: (e as Error)?.message });
  process.exit(1);
};
process.on("unhandledRejection", crash);
log("start", { pid: process.pid, node: process.version });
start().catch(crash);
