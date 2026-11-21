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
  const mine = (k: Key) => !!k.remoteJid && linked.has(k.remoteJid) && !k.fromMe;

  if (event === "messages.upsert") {
    return (payload.messages as Msg[]).filter((m) => mine(m.key)).map((m): WaRecord => {
      const text = textOf(m.message);
      const type = !m.message && m.messageStubType === STUB_CIPHERTEXT ? "undecryptable" : text === undefined ? "other" : payload.type;
      return { ...base(m.key, m), sentAt: ts(m.messageTimestamp), type, ...(text === undefined ? {} : { text }) };
    });
  }

  if (event === "messages.update") {
    return (payload as Update[]).filter((u) => mine(u.key)).flatMap((u): WaRecord[] => {
      const edited = u.update.message?.editedMessage?.message;
      if (edited) return [{ ...base(u.key), sentAt: ts(u.update.messageTimestamp), type: "edit", text: textOf(edited) ?? "" }];
      if (u.update.messageStubType === STUB_REVOKE) return [{ ...base(u.key), sentAt: null, type: "revoke" }];
      return []; // delivery status and other bookkeeping
    });
  }

  if (event === "messages.delete") {
    if ("all" in payload) return linked.has(payload.jid) ? [{ group: payload.jid, id: "*", sender: "unknown", sentAt: null, type: "revoke" }] : [];
    return (payload.keys as Key[]).filter(mine).map((k): WaRecord => ({ ...base(k), sentAt: null, type: "revoke" }));
  }

  return [];
}
