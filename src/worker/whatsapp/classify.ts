// Maps raw Baileys events to inbox records (design file 63); first written in the M0 spike. Pure, so it is unit-tested.
// Structural types instead of Baileys' own, so tests can pass plain literals.
import { getContentType, normalizeMessageContent, type proto } from "baileys";

type Key = { remoteJid?: string | null; id?: string | null; fromMe?: boolean | null; participant?: string | null };
type Content = { conversation?: string | null; extendedTextMessage?: { text?: string | null } | null; editedMessage?: { message?: Content } | null } | null | undefined;
type Msg = { key: Key; message?: Content; messageTimestamp?: number | { toNumber(): number } | null; pushName?: string | null; messageStubType?: number | null };
type Update = { key: Key; update: Partial<Msg> };

export type WaRecord = {
  group: string;
  id: string;
  sender: string;
  sentAt: number | null; // unix seconds
  type: "notify" | "append" | "edit" | "revoke" | "other" | "undecryptable";
  text?: string;
  contentType?: string; // for a message with no text: what it was (reactionMessage, stickerMessage…), to spot gaps
};

// proto.WebMessageInfo.StubType values (checked against baileys 7.0.0-rc14)
const STUB_REVOKE = 1;
const STUB_CIPHERTEXT = 2;

// WhatsApp wraps many messages (disappearing, view-once, documents with captions); Baileys unwraps them (#92).
const inner = (m: Content) => normalizeMessageContent(m as proto.IMessage | undefined);
// Edits come through messages.update, so an edit arriving as a new message is never read as new text.
const isEdit = (m: Content) => !!(m as proto.IMessage | null | undefined)?.editedMessage || !!(m as proto.IMessage | null | undefined)?.protocolMessage;
const textOf = (m: Content): string | undefined => {
  if (isEdit(m)) return undefined;
  const n = inner(m);
  return n?.conversation ?? n?.extendedTextMessage?.text ?? n?.imageMessage?.caption ?? n?.videoMessage?.caption ?? n?.documentMessage?.caption ?? undefined;
};
const ts = (t: Msg["messageTimestamp"]) => (t == null ? null : typeof t === "number" ? t : t.toNumber());

type Upsert = { type: "notify" | "append"; messages: Msg[] };
type Delete = { keys: Key[] } | { jid: string; all: true };

/** `payload` is Baileys' event payload for `event`; it comes from outside, so it is narrowed here rather than trusted. */
export function classify(event: string, payload: unknown, linked: ReadonlySet<string>): WaRecord[] {
  const base = (k: Key, m?: Partial<Msg>) => ({
    group: k.remoteJid!,
    id: k.id!,
    sender: m?.pushName || k.participant || "unknown",
  });
  const wanted = (k: Key) => !!k.remoteJid && linked.has(k.remoteJid) && !k.fromMe;

  if (event === "messages.upsert") {
    const p = payload as Upsert;
    return p.messages.filter((m) => wanted(m.key)).map((m): WaRecord => {
      const text = textOf(m.message);
      const type = !m.message && m.messageStubType === STUB_CIPHERTEXT ? "undecryptable" : text === undefined ? "other" : p.type;
      const contentType = type === "other" ? getContentType(isEdit(m.message) ? (m.message as proto.IMessage) : inner(m.message)) : undefined;
      return { ...base(m.key, m), sentAt: ts(m.messageTimestamp), type, ...(text === undefined ? {} : { text }), ...(contentType ? { contentType } : {}) };
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
    const p = payload as Delete;
    if ("all" in p) return linked.has(p.jid) ? [{ group: p.jid, id: "*", sender: "unknown", sentAt: null, type: "revoke" }] : [];
    return p.keys.filter(wanted).map((k): WaRecord => ({ ...base(k), sentAt: null, type: "revoke" }));
  }

  return [];
}

