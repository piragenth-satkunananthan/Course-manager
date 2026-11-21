// Maps raw Baileys events to the records the spike counts and stores. Pure, so it is unit-tested.
// Structural types instead of Baileys' own, so tests can pass plain literals.

type Key = { remoteJid?: string | null; id?: string | null; fromMe?: boolean | null; participant?: string | null };
type Content = Record<string, any> | null | undefined;
type Msg = { key: Key; message?: Content; messageTimestamp?: number | { toNumber(): number } | null; pushName?: string | null; messageStubType?: number | null };
type Update = { key: Key; update: Partial<Msg> };

export type WaRecord = {
  group: string;
  id: string;
  sender: string;
  sentAt: number | null; // unix seconds
  type: "notify" | "append" | "edit" | "revoke" | "other" | "undecryptable";
  text?: string;
};

// proto.WebMessageInfo.StubType values (checked against baileys 7.0.0-rc14)
const STUB_REVOKE = 1;
const STUB_CIPHERTEXT = 2;

const textOf = (m: Content): string | undefined => m?.conversation ?? m?.extendedTextMessage?.text ?? undefined;
const ts = (t: Msg["messageTimestamp"]) => (t == null ? null : typeof t === "number" ? t : t.toNumber());

export function classify(event: string, payload: any, linked: ReadonlySet<string>): WaRecord[] {
  const base = (k: Key, m?: Partial<Msg>) => ({
    group: k.remoteJid!,
    id: k.id!,
    sender: m?.pushName || k.participant || "unknown",
  });
  const wanted = (k: Key) => !!k.remoteJid && linked.has(k.remoteJid) && !k.fromMe;

  if (event === "messages.upsert") {
    return (payload.messages as Msg[]).filter((m) => wanted(m.key)).map((m): WaRecord => {
      const text = textOf(m.message);
      const type = !m.message && m.messageStubType === STUB_CIPHERTEXT ? "undecryptable" : text === undefined ? "other" : payload.type;
      return { ...base(m.key, m), sentAt: ts(m.messageTimestamp), type, ...(text === undefined ? {} : { text }) };
    });
  }

  if (event === "messages.update") {
    return (payload as Update[]).filter((u) => wanted(u.key)).flatMap((u): WaRecord[] => {
      const edited = u.update.message?.editedMessage?.message;
      if (edited) return [{ ...base(u.key), sentAt: ts(u.update.messageTimestamp), type: "edit", text: textOf(edited) ?? "" }];
      if (u.update.messageStubType === STUB_REVOKE) return [{ ...base(u.key), sentAt: null, type: "revoke" }];
      return []; // delivery status and other bookkeeping
    });
  }

  if (event === "messages.delete") {
    if ("all" in payload) return linked.has(payload.jid) ? [{ group: payload.jid, id: "*", sender: "unknown", sentAt: null, type: "revoke" }] : [];
    return (payload.keys as Key[]).filter(wanted).map((k): WaRecord => ({ ...base(k), sentAt: null, type: "revoke" }));
  }

  return [];
}

// For logging event shapes: keeps structure, ids, timestamps and types; hides every other string
// (message text, link previews, names) and the number part of every JID. Fail-safe: unknown keys are hidden.
const KEEP = new Set(["id", "fromMe", "messageTimestamp", "timestampMs", "messageStubType", "type", "status", "addressingMode"]);
export function redactShape(v: any, k = ""): any {
  if (typeof v === "string") return KEEP.has(k) ? v : v.includes("@") ? v.replace(/^[^@]*/, "<jid>") : `<${v.length} chars>`;
  if (typeof v === "bigint") return String(v);
  if (v instanceof Uint8Array) return `<${v.length} bytes>`;
  if (Array.isArray(v)) return v.map((x) => redactShape(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([kk, x]) => [kk, redactShape(x, kk)]));
  return v;
}
