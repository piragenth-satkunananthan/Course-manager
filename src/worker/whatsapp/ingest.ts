// Message intake (design file 63). Only linked groups; the Student's own messages are ignored; text is encrypted
// and never logged. Duplicates are skipped (ON CONFLICT DO NOTHING), so offline redelivery is harmless.
import { and, eq, isNotNull, or } from "drizzle-orm";
import { encrypt } from "@/server/crypto";
import { db } from "@/server/db/client";
import { course, inboxMessage, waGroup, waSession } from "@/server/db/schema";
import { classify } from "./classify";

type Linked = { groupId: string; semesterId: string | null };

export class Ingest {
  private linked = new Map<string, Linked>();
  private own = new Set<string>();

  constructor(
    private readonly studentId: string,
    private readonly key: Buffer,
  ) {}

  /** The linked groups and the Semester each belongs to (directly, or through its Course). */
  async reloadGroups() {
    const rows = await db
      .select({ id: waGroup.id, jid: waGroup.waJid, semesterId: waGroup.linkedSemesterId, courseSemesterId: course.semesterId })
      .from(waGroup)
      .leftJoin(course, eq(course.id, waGroup.linkedCourseId))
      .where(and(eq(waGroup.studentId, this.studentId), or(isNotNull(waGroup.linkedCourseId), isNotNull(waGroup.linkedSemesterId))));
    this.linked = new Map(rows.map((r) => [r.jid, { groupId: r.id, semesterId: r.semesterId ?? r.courseSemesterId }]));
  }

  /** The Student's own JIDs: kept for protocol messages between their devices (design §8). */
  setOwnJids(jids: string[]) {
    this.own = new Set(jids);
  }

  /** For Baileys' shouldIgnoreJid: every chat except linked groups and the Student's own JID is dropped before decryption. */
  shouldIgnoreJid = (jid: string) => !this.linked.has(jid) && !this.own.has(jid);

  async handle(event: "messages.upsert" | "messages.update" | "messages.delete", payload: unknown) {
    const records = classify(event, payload, new Set(this.linked.keys()));
    for (const r of records) {
      const group = this.linked.get(r.group);
      if (!group || r.id === "*") continue; // "*": a whole chat cleared on the phone, not a revoke
      const base = { studentId: this.studentId, waGroupId: group.groupId, semesterId: group.semesterId, senderName: r.sender };
      const sentAt = r.sentAt ? new Date(r.sentAt * 1000) : new Date();

      if (r.type === "notify" || r.type === "append") {
        await db.insert(inboxMessage).values({ ...base, waMessageId: r.id, kind: "text", sentAt, textEnc: encrypt(r.text ?? "", this.key) }).onConflictDoNothing();
      } else if (r.type === "other" || r.type === "undecryptable") {
        await db.insert(inboxMessage).values({ ...base, waMessageId: r.id, kind: "other", sentAt, status: "done", decision: "ignored" }).onConflictDoNothing();
      } else if (r.type === "edit") {
        // An edit is its own row with the edit's time, so its correction wins over the original (§3).
        const original = await this.find(group.groupId, r.id);
        await db
          .insert(inboxMessage)
          .values({ ...base, waMessageId: `${r.id}:edit:${r.sentAt ?? Math.floor(+sentAt / 1000)}`, kind: "edit", editOf: original?.id ?? null, sentAt, textEnc: encrypt(r.text ?? "", this.key) })
          .onConflictDoNothing();
      } else if (r.type === "revoke") {
        const original = await this.find(group.groupId, r.id);
        if (original) await db.update(inboxMessage).set({ revokedAt: new Date() }).where(and(eq(inboxMessage.studentId, this.studentId), eq(inboxMessage.id, original.id)));
        await db.insert(inboxMessage).values({ ...base, waMessageId: `${r.id}:revoke`, kind: "revoke", editOf: original?.id ?? null, sentAt }).onConflictDoNothing();
      }
    }
    if (records.length) await db.update(waSession).set({ lastEventAt: new Date() }).where(eq(waSession.studentId, this.studentId));
  }

  private async find(groupId: string, waMessageId: string) {
    const [row] = await db
      .select({ id: inboxMessage.id })
      .from(inboxMessage)
      .where(and(eq(inboxMessage.studentId, this.studentId), eq(inboxMessage.waGroupId, groupId), eq(inboxMessage.waMessageId, waMessageId)));
    return row;
  }
}
