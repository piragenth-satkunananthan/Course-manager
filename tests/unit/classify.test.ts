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

  it("reads text inside WhatsApp's wrappers and from captions (#92)", () => {
    const out = classify("messages.upsert", {
      type: "notify",
      messages: [
        { key: key("D1"), messageTimestamp: 8, message: { ephemeralMessage: { message: { extendedTextMessage: { text: "CA on Friday" } } } } },
        { key: key("D2"), messageTimestamp: 8, message: { viewOnceMessageV2: { message: { conversation: "once" } } } },
        { key: key("D3"), messageTimestamp: 8, message: { imageMessage: { caption: "Timetable for next week" } } },
        { key: key("D4"), messageTimestamp: 8, message: { documentWithCaptionMessage: { message: { documentMessage: { caption: "Lab sheet 5, due Monday" } } } } },
        { key: key("D5"), messageTimestamp: 8, message: { ephemeralMessage: { message: { videoMessage: { caption: "Recording" } } } } },
      ],
    }, linked);
    expect(out.map((r) => [r.id, r.type, r.text])).toEqual([
      ["D1", "notify", "CA on Friday"],
      ["D2", "notify", "once"],
      ["D3", "notify", "Timetable for next week"],
      ["D4", "notify", "Lab sheet 5, due Monday"],
      ["D5", "notify", "Recording"],
    ]);
  });

  it("records the content type of a message that still has no text (#92)", () => {
    const out = classify("messages.upsert", {
      type: "notify",
      messages: [
        { key: key("E1"), messageTimestamp: 9, message: { reactionMessage: { text: "👍" } } },
        { key: key("E2"), messageTimestamp: 9, message: { ephemeralMessage: { message: { stickerMessage: {} } } } },
        { key: key("E3"), messageTimestamp: 9, message: { editedMessage: { message: { conversation: "an edit arriving as a new message" } } } },
      ],
    }, linked);
    expect(out.map((r) => [r.id, r.type, r.contentType])).toEqual([
      ["E1", "other", "reactionMessage"],
      ["E2", "other", "stickerMessage"],
      ["E3", "other", "editedMessage"], // edits are read from messages.update, so it isn't counted twice
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

