// The Activity Log and Undo (design file 46). Source message text is decrypted here for display only.
import { and, desc, eq, gt, gte, inArray, isNull, lt, ne, type SQL } from "drizzle-orm";
import { decrypt, loadKey } from "@/server/crypto";
import { db } from "@/server/db/client";
import { activityEvent, assignment, autoChange, autoChangeSource, entityVersion, exam, inboxMessage, suppression, waGroup } from "@/server/db/schema";
import { canUndo, HIGHLIGHT_DAYS, titleKey } from "@/server/domain/auto-change";
import { AppError, notFound } from "@/server/http/errors";
import type { ActivityItem, AutoChangeItem } from "@/shared/schemas/activity";
import { iso } from "./util";
import { writeEntity } from "./write-entity";

type Change = typeof autoChange.$inferSelect;
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const TABLES = { assignment, exam } as const;

/** The item's current version and who made the version after the change, to apply and explain the Undo rule. */
async function undoState(x: typeof db | Tx, c: Change) {
  const table = TABLES[c.entityType as keyof typeof TABLES];
  const [row] = table ? await x.select({ version: table.version }).from(table).where(and(eq(table.studentId, c.studentId), eq(table.id, c.entityId))) : [];
  const [next] = await x
    .select({ actor: entityVersion.actor })
    .from(entityVersion)
    .where(and(eq(entityVersion.studentId, c.studentId), eq(entityVersion.entityType, c.entityType), eq(entityVersion.entityId, c.entityId), gt(entityVersion.version, c.afterVersion)))
    .orderBy(entityVersion.version)
    .limit(1);
  return canUndo(c, row?.version ?? -1, next?.actor ?? null);
}

// shortcut: two queries per change for its Undo state; fine at one Student's volume, batch them if pages get slow.
async function toItems(changes: Change[]): Promise<AutoChangeItem[]> {
  if (!changes.length) return [];
  const key = loadKey();
  const sources = await db
    .select({ changeId: autoChangeSource.autoChangeId, senderName: inboxMessage.senderName, sentAt: inboxMessage.sentAt, textEnc: inboxMessage.textEnc, groupSubject: waGroup.subject })
    .from(autoChangeSource)
    .innerJoin(inboxMessage, eq(inboxMessage.id, autoChangeSource.inboxMessageId))
    .innerJoin(waGroup, eq(waGroup.id, inboxMessage.waGroupId))
    .where(inArray(autoChangeSource.autoChangeId, changes.map((c) => c.id)));
  return Promise.all(
    changes.map(async (c) => {
      const state = await undoState(db, c);
      return {
        id: c.id, createdAt: c.createdAt.toISOString(), summary: c.summary, risk: c.risk, undoneAt: iso(c.undoneAt), entityType: c.entityType, entityId: c.entityId,
        canUndo: state.ok, undoBlockedReason: state.ok ? null : state.reason,
        // Text is erased when its Semester is archived (D1).
        sources: sources.filter((s) => s.changeId === c.id).map((s) => ({ senderName: s.senderName, sentAt: s.sentAt.toISOString(), text: s.textEnc ? decrypt(s.textEnc, key) : null, groupSubject: s.groupSubject })),
      };
    }),
  );
}

export const listAutoChanges = async (studentId: string, where?: SQL) =>
  toItems(await db.select().from(autoChange).where(and(eq(autoChange.studentId, studentId), where)).orderBy(desc(autoChange.createdAt)));

/** The dashboard's Check these (risky, not undone, 7 days; U3) and Recent changes (48 hours). */
export async function dashboardChanges(studentId: string, now: Date) {
  const [highlighted, recent] = await Promise.all([
    listAutoChanges(studentId, and(ne(autoChange.risk, "normal"), gte(autoChange.createdAt, new Date(+now - HIGHLIGHT_DAYS * 86_400_000)), isNull(autoChange.undoneAt))),
    listAutoChanges(studentId, gte(autoChange.createdAt, new Date(+now - 48 * 3_600_000))),
  ]);
  return { highlightedChanges: highlighted, recentAutoChanges: recent };
}

const PAGE = 50;
// shortcut: the cursor is a timestamp, so rows sharing the boundary microsecond could be skipped; add an id tiebreak if seen.
export async function listActivity(studentId: string, cursor?: string): Promise<{ items: ActivityItem[]; nextCursor: string | null }> {
  const before = cursor ? new Date(cursor) : null;
  const [changes, events] = await Promise.all([
    db.select().from(autoChange).where(and(eq(autoChange.studentId, studentId), before ? lt(autoChange.createdAt, before) : undefined)).orderBy(desc(autoChange.createdAt)).limit(PAGE),
    db.select().from(activityEvent).where(and(eq(activityEvent.studentId, studentId), before ? lt(activityEvent.createdAt, before) : undefined)).orderBy(desc(activityEvent.createdAt)).limit(PAGE),
  ]);
  const items: ActivityItem[] = [
    ...(await toItems(changes)).map((c) => ({ type: "auto_change" as const, ...c })),
    ...events.map((e) => ({ type: "event" as const, id: e.id, kind: e.kind, payload: e.payload, createdAt: e.createdAt.toISOString() })),
  ]
    .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    .slice(0, PAGE);
  return { items, nextCursor: items.length === PAGE ? items.at(-1)!.createdAt : null };
}

/**
 * Undo (design §3): allowed only while nothing has changed the item since. Restores the earlier values and their set
 * times as a new version. The Student's Undo of an AI-created item adds a suppression, so a repeat can't recreate it;
 * the system's (an edited or deleted message) doesn't. Returns why it was blocked, if it was.
 */
export async function undoChange(tx: Tx, c: Change, actor: "student" | "system"): Promise<{ ok: true } | { ok: false; reason: string }> {
  const state = await undoState(tx, c);
  if (!state.ok) return state;
  const [v] = await tx.select().from(entityVersion).where(and(eq(entityVersion.studentId, c.studentId), eq(entityVersion.autoChangeId, c.id)));
  if (!v || (c.entityType !== "assignment" && c.entityType !== "exam")) return { ok: false, reason: "This change can't be undone" };

  const restore: Record<string, unknown> = c.op === "create" ? { deletedAt: new Date() } : c.op === "delete" ? { deletedAt: null } : { ...v.before };
  await writeEntity(tx, { studentId: c.studentId, entityType: c.entityType, op: "undo", entityId: c.entityId, restore, restoreFieldSetAt: v.beforeFieldSetAt, actor, setAt: new Date().toISOString() });
  await tx.update(autoChange).set({ undoneAt: new Date() }).where(eq(autoChange.id, c.id));
  if (c.op === "create" && actor === "student") {
    const after = v.after as { courseId: string; title: string; dueDate?: string; date?: string | null };
    await tx.insert(suppression).values({ studentId: c.studentId, courseId: after.courseId, entityType: c.entityType, titleKey: titleKey(after.title), dueDate: (c.entityType === "assignment" ? after.dueDate : after.date) ?? null });
  }
  return { ok: true };
}

/** Undo pressed by the Student: blocked is a 409 with the reason. */
export async function undoAutoChange(studentId: string, id: string) {
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(autoChange).where(and(eq(autoChange.studentId, studentId), eq(autoChange.id, id))).for("update");
    if (!c) throw notFound("Change");
    const r = await undoChange(tx, c, "student");
    if (!r.ok) throw new AppError("UNDO_BLOCKED", r.reason);
  });
  return (await listAutoChanges(studentId, eq(autoChange.id, id)))[0]!;
}
