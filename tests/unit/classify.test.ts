import { describe, expect, it } from "vitest";
import { classify } from "../../src/worker/whatsapp/classify";

const G = "120363000000000001@g.us";
const OTHER = "120363000000000999@g.us";
const linked = new Set([G]);
const key = (id: string, jid = G, fromMe = false) => ({ remoteJid: jid, id, fromMe, participant: "94770000001@s.whatsapp.net" });

describe("classify", () => {
  it("records plain and extended text from a linked group, keeping the upsert type", () => {
    const out = classify("messages.upsert", {
      type: "append",
      messages: [
        { key: key("A1"), messageTimestamp: 1763700000, pushName: "Kavin", message: { conversation: "Lab 3 due Friday" } },
        { key: key("A2"), messageTimestamp: 1763700060, message: { extendedTextMessage: { text: "see https://x" } } },
      ],
    }, linked);
    expect(out).toEqual([
      { group: G, id: "A1", sender: "Kavin", sentAt: 1763700000, type: "append", text: "Lab 3 due Friday" },
      { group: G, id: "A2", sender: "94770000001@s.whatsapp.net", sentAt: 1763700060, type: "append", text: "see https://x" },
    ]);
  });

  it("drops unlinked chats and my own messages", () => {
    const out = classify("messages.upsert", {
      type: "notify",
      messages: [
        { key: key("B1", OTHER), messageTimestamp: 1, message: { conversation: "family" } },
        { key: key("B2", G, true), messageTimestamp: 1, message: { conversation: "me" } },
      ],
    }, linked);
    expect(out).toEqual([]);
  });

  it("marks non-text, protocol and undecryptable messages without text", () => {
    const out = classify("messages.upsert", {
      type: "notify",
      messages: [
        { key: key("C1"), messageTimestamp: 5, message: { imageMessage: {} } },
        { key: key("C2"), messageTimestamp: 6, message: { protocolMessage: { type: 0 } } },
        { key: key("C3"), messageTimestamp: 7, messageStubType: 2 },
      ],
    }, linked);
    expect(out.map((r) => [r.id, r.type, r.text])).toEqual([
      ["C1", "other", undefined],
      ["C2", "other", undefined],
      ["C3", "undecryptable", undefined],
    ]);
  });

  it("records an edit on the original key with the edit's own timestamp", () => {
    const out = classify("messages.update", [
      { key: key("D1"), update: { message: { editedMessage: { message: { conversation: "due Thursday" } } }, messageTimestamp: 1763709999 } },
      { key: key("D2"), update: { status: 3 } },
    ], linked);
    expect(out).toEqual([{ group: G, id: "D1", sender: "94770000001@s.whatsapp.net", sentAt: 1763709999, type: "edit", text: "due Thursday" }]);
  });

  it("records a revoke from either event form", () => {
    const fromUpdate = classify("messages.update", [{ key: key("E1"), update: { message: null, messageStubType: 1 } }], linked);
    const fromDelete = classify("messages.delete", { keys: [key("E2"), key("E3", OTHER)] }, linked);
    const clearAll = classify("messages.delete", { jid: G, all: true }, linked);
    expect([...fromUpdate, ...fromDelete, ...clearAll].map((r) => [r.id, r.type, r.sentAt])).toEqual([
      ["E1", "revoke", null],
      ["E2", "revoke", null],
      ["*", "revoke", null],
    ]);
  });
});

