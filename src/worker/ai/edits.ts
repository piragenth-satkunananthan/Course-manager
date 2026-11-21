// Edited and deleted messages (design §9, file 64): both undo the changes a message made, with the system as actor
// and the Undo rule applied. An edit is then processed as a new message; a delete needs no AI call.
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { type Tx, undoChange } from "@/server/data/activity";
import { db } from "@/server/db/client";
import { activityEvent, autoChange, autoChangeSource, inboxMessage, user } from "@/server/db/schema";

const STILL_ANNOUNCED = "Another message still announces it";

/** A message and its edits: every row a change from that message can name as a source. */
async function family(tx: Tx, originalId: string) {
  const rows = await tx.select({ id: inboxMessage.id }).from(inboxMessage).where(or(eq(inboxMessage.id, originalId), eq(inboxMessage.editOf, originalId)));
  return new Set(rows.map((r) => r.id));
}

/** Auto Changes not yet undone that name any of `ids` as a source, each with all its sources. */
async function changesFrom(tx: Tx, studentId: string, ids: Set<string>) {
  if (!ids.size) return [];
  const touched = await tx.selectDistinct({ id: autoChangeSource.autoChangeId }).from(autoChangeSource).where(inArray(autoChangeSource.inboxMessageId, [...ids]));
  if (!touched.length) return [];
  const changes = await tx
    .select()
    .from(autoChange)
    .where(and(eq(autoChange.studentId, studentId), inArray(autoChange.id, touched.map((t) => t.id)), isNull(autoChange.undoneAt)))
    .orderBy(autoChange.createdAt)
    .for("update");
  const sources = changes.length ? await tx.select().from(autoChangeSource).where(inArray(autoChangeSource.autoChangeId, changes.map((c) => c.id))) : [];
  return changes.map((c) => ({ change: c, sources: sources.filter((s) => s.autoChangeId === c.id).map((s) => s.inboxMessageId) }));
}

/**
 * Before an edit is processed: undo the changes that came only from its original (or the original's earlier edits),
 * restoring the earlier values and set times. A blocked Undo keeps the change; the edit then applies over it.
 */
export async function undoEditedOriginals(studentId: string, edits: { id: string; editOf: string | null }[]) {
  const batch = new Set(edits.map((e) => e.id));
  for (const originalId of new Set(edits.flatMap((e) => (e.editOf ? [e.editOf] : [])))) {
    await db.transaction(async (tx) => {
      const earlier = new Set([...(await family(tx, originalId))].filter((id) => !batch.has(id)));
      for (const { change, sources } of await changesFrom(tx, studentId, earlier)) {
        if (sources.every((s) => earlier.has(s))) await undoChange(tx, change, "system");
      }
    });
  }
}

/** Which of these source messages are deleted: the message itself, or the original an edit belongs to. */
async function deletedOf(tx: Tx, ids: string[]) {
  const rows = await tx.select({ id: inboxMessage.id, revokedAt: inboxMessage.revokedAt, editOf: inboxMessage.editOf }).from(inboxMessage).where(inArray(inboxMessage.id, ids));
  const originals = rows.flatMap((r) => (r.editOf ? [r.editOf] : []));
  const revokedOriginals = new Set(
    originals.length ? (await tx.select({ id: inboxMessage.id, revokedAt: inboxMessage.revokedAt }).from(inboxMessage).where(inArray(inboxMessage.id, originals))).filter((o) => o.revokedAt).map((o) => o.id) : [],
  );
  return new Set(rows.filter((r) => r.revokedAt || (r.editOf && revokedOriginals.has(r.editOf))).map((r) => r.id));
}

/**
 * Deletes (pending revoke rows), handled before any batch so a repost that follows is read against the result.
 * A change is undone only when every one of its source messages is deleted and the Undo rule allows it; otherwise an
 * Activity event says why it was kept. A message deleted before the AI read it is skipped.
 */
export async function processDeletes() {
  const revokes = await db
    .select({ id: inboxMessage.id, studentId: inboxMessage.studentId, editOf: inboxMessage.editOf })
    .from(inboxMessage)
    .innerJoin(user, eq(user.id, inboxMessage.studentId))
    .where(and(eq(inboxMessage.kind, "revoke"), eq(inboxMessage.status, "pending"), eq(user.autoChangesPaused, false)))
    .orderBy(inboxMessage.receivedAt);
  for (const r of revokes) {
    await db.transaction(async (tx) => {
      let undone = 0;
      if (r.editOf) {
        await tx
          .update(inboxMessage)
          .set({ status: "done", decision: "ignored", decisionReason: "deleted before it was read" })
          .where(and(or(eq(inboxMessage.id, r.editOf), eq(inboxMessage.editOf, r.editOf)), eq(inboxMessage.status, "pending"), inArray(inboxMessage.kind, ["text", "edit"])));
        for (const { change, sources } of await changesFrom(tx, r.studentId, await family(tx, r.editOf))) {
          const deleted = await deletedOf(tx, sources);
          const result = sources.every((s) => deleted.has(s)) ? await undoChange(tx, change, "system") : { ok: false as const, reason: STILL_ANNOUNCED };
          if (result.ok) undone++;
          else
            await tx.insert(activityEvent).values({ studentId: r.studentId, kind: "change_kept", payload: { autoChangeId: change.id, summary: change.summary, reason: result.reason, messageId: r.editOf } });
        }
      }
      await tx
        .update(inboxMessage)
        .set({ status: "done", decision: undone ? "applied" : "ignored", decisionReason: undone ? `withdrew ${undone} change(s)` : "nothing to withdraw" })
        .where(eq(inboxMessage.id, r.id));
    });
  }
}
