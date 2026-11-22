// The Activity Log and Undo (design file 46). Source message text is decrypted here for display only.
import { and, desc, eq, gt, gte, inArray, isNull, lt, ne, type SQL } from "drizzle-orm";
import { applyOperations } from "@/server/ai/apply-operations";
import { buildContext } from "@/server/ai/context";
import { pgAdapter } from "@/server/ai/pg-adapter";
import { REPEATS, SUPERSEDED, validateOutput } from "@/server/ai/validate";
import { decrypt, loadKey } from "@/server/crypto";
import { db, type Tx } from "@/server/db/client";
import { activityEvent, aiBatch, assignment, autoChange, autoChangeSource, course, courseNickname, entityVersion, exam, inboxMessage, semester, suppression, unknownCourseMention, waGroup } from "@/server/db/schema";
import { canUndo, HIGHLIGHT_DAYS, titleKey } from "@/server/domain/auto-change";
import { AppError, invalid, notFound } from "@/server/http/errors";
import type { ActivityItem, AutoChangeItem, ResolveResult, UnknownCourseResolve } from "@/shared/schemas/activity";
import { createCourse, getCourse } from "./courses";
import { iso } from "./util";
import { writeEntity } from "./write-entity";

type Change = typeof autoChange.$inferSelect;
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
  const key = loadKey();
  const first = db.$with("first").as(db.select({ id: inboxMessage.id, senderName: inboxMessage.senderName, sentAt: inboxMessage.sentAt, textEnc: inboxMessage.textEnc, groupSubject: waGroup.subject }).from(inboxMessage).innerJoin(waGroup, eq(waGroup.id, inboxMessage.waGroupId)));
  const [changes, events, missed, unknown] = await Promise.all([
    db.select().from(autoChange).where(and(eq(autoChange.studentId, studentId), before ? lt(autoChange.createdAt, before) : undefined)).orderBy(desc(autoChange.createdAt)).limit(PAGE),
    db.select().from(activityEvent).where(and(eq(activityEvent.studentId, studentId), before ? lt(activityEvent.createdAt, before) : undefined)).orderBy(desc(activityEvent.createdAt)).limit(PAGE),
    db
      .select({ m: inboxMessage, groupSubject: waGroup.subject, courseId: waGroup.linkedCourseId })
      .from(inboxMessage)
      .innerJoin(waGroup, eq(waGroup.id, inboxMessage.waGroupId))
      .where(and(eq(inboxMessage.studentId, studentId), eq(inboxMessage.possiblyMissed, true), isNull(inboxMessage.revokedAt), before ? lt(inboxMessage.receivedAt, before) : undefined))
      .orderBy(desc(inboxMessage.receivedAt))
      .limit(PAGE),
    db
      .with(first)
      .select({ u: unknownCourseMention, first: { senderName: first.senderName, sentAt: first.sentAt, textEnc: first.textEnc, groupSubject: first.groupSubject } })
      .from(unknownCourseMention)
      .leftJoin(first, eq(first.id, unknownCourseMention.firstMessageId))
      .where(and(eq(unknownCourseMention.studentId, studentId), before ? lt(unknownCourseMention.createdAt, before) : undefined))
      .orderBy(desc(unknownCourseMention.createdAt))
      .limit(PAGE),
  ]);
  const text = (enc: Buffer | null) => (enc ? decrypt(enc, key) : null);
  const items: ActivityItem[] = [
    ...(await toItems(changes)).map((c) => ({ type: "auto_change" as const, ...c })),
    ...events.map((e) => ({ type: "event" as const, id: e.id, kind: e.kind, payload: e.payload, createdAt: e.createdAt.toISOString() })),
    ...missed.map(({ m, groupSubject, courseId }) => ({
      type: "possibly_missed" as const, inboxMessageId: m.id, senderName: m.senderName, sentAt: m.sentAt.toISOString(), text: text(m.textEnc), groupSubject,
      reason: m.decision === "possibly_missed" ? m.decisionReason : null, courseId, createdAt: m.receivedAt.toISOString(),
    })),
    ...unknown.map(({ u, first: f }) => ({
      type: "unknown_course" as const, id: u.id, name: u.name, status: u.status, operations: u.pendingOps.length, createdAt: u.createdAt.toISOString(),
      firstMessage: f?.sentAt ? { senderName: f.senderName, sentAt: f.sentAt.toISOString(), text: text(f.textEnc), groupSubject: f.groupSubject! } : null,
    })),
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
  await tx.update(autoChange).set({ undoneAt: new Date() }).where(and(eq(autoChange.studentId, c.studentId), eq(autoChange.id, c.id)));
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

/** Dismiss on a Possibly Missed message (or after adding from it): it leaves the Activity Log and the digest. */
export async function dismissPossiblyMissed(studentId: string, inboxMessageId: string) {
  const done = await db
    .update(inboxMessage)
    .set({ possiblyMissed: false })
    .where(and(eq(inboxMessage.studentId, studentId), eq(inboxMessage.id, inboxMessageId), eq(inboxMessage.possiblyMissed, true)))
    .returning({ id: inboxMessage.id });
  if (!done.length) throw notFound("Message");
  return null;
}

/**
 * Resolving an Unknown Course (design file 46). "add" creates the Course in the current Semester, with the name as
 * a Nickname; "nickname" maps the name to an existing Course. Either way each pending operation gets the Course,
 * is validated against a fresh context, and applied as an Auto Change of its original batch (actor ai), so it can be
 * undone. One that no longer passes becomes Possibly Missed. "ignore" stops the name being logged.
 */
export async function resolveUnknownCourse(studentId: string, id: string, input: UnknownCourseResolve, now = new Date()): Promise<ResolveResult> {
  const mention = async (x: typeof db | Tx) => (await x.select().from(unknownCourseMention).where(and(eq(unknownCourseMention.studentId, studentId), eq(unknownCourseMention.id, id))))[0];
  const open = await mention(db);
  if (!open) throw notFound("Unknown Course");
  if (open.status !== "open") throw new AppError("CONFLICT", "This Unknown Course was already resolved");
  if (input.action === "ignore") {
    await db.update(unknownCourseMention).set({ status: "ignored", resolvedAt: now }).where(eq(unknownCourseMention.id, id));
    return { applied: 0, possiblyMissed: 0, course: null };
  }

  const [current] = await db.select({ id: semester.id }).from(semester).where(and(eq(semester.studentId, studentId), eq(semester.isCurrent, true), isNull(semester.archivedAt)));
  if (!current) throw new AppError("CONFLICT", "Set a current Semester first");
  let courseId: string;
  if (input.action === "add") {
    // shortcut: the Course is created before the transaction below, so a failure after it leaves the Course; the entry stays open and "Nickname of…" finishes it.
    const { code, name, lecturerName, colour, practicalOfCourseId } = input;
    courseId = (await createCourse(studentId, { semesterId: current.id, code, name, lecturerName, colour, practicalOfCourseId })).id;
  } else {
    const [c] = await db.select({ semesterId: course.semesterId, archivedAt: course.archivedAt }).from(course).where(and(eq(course.studentId, studentId), eq(course.id, input.courseId)));
    if (!c) throw notFound("Course");
    if (c.semesterId !== current.id || c.archivedAt) throw invalid("courseId", "Choose a Course in the current Semester");
    courseId = input.courseId;
  }

  const result = await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(unknownCourseMention).where(eq(unknownCourseMention.id, id)).for("update");
    if (locked?.status !== "open") throw new AppError("CONFLICT", "This Unknown Course was already resolved");
    const [c] = await tx.select({ code: course.code, name: course.name }).from(course).where(eq(course.id, courseId));
    if (locked.nameKey.length <= 50 && locked.nameKey !== c!.code.toLowerCase() && locked.nameKey !== c!.name.toLowerCase())
      await tx.insert(courseNickname).values({ studentId, courseId, nickname: locked.nameKey, source: "unknown_course" }).onConflictDoNothing();

    let applied = 0;
    const missed = new Set<string>();
    const key = loadKey();
    // One operation at a time against a context rebuilt each time, so a repeat of one just applied is seen as a repeat.
    for (const p of locked.pendingOps) {
      const op: Record<string, unknown> = { ...p.op, courseId };
      const ids = Array.isArray(op.sourceMessageIds) ? (op.sourceMessageIds as string[]) : [];
      const sources = ids.length
        ? await tx.select({ id: inboxMessage.id, sentAt: inboxMessage.sentAt }).from(inboxMessage).where(and(eq(inboxMessage.studentId, studentId), inArray(inboxMessage.id, ids), isNull(inboxMessage.revokedAt)))
        : [];
      const ctx = await buildContext(
        { ...pgAdapter(tx, studentId, "", [], key, now), getRecentMessages: async () => [] },
        { now, linkedTo: { courseId }, messages: sources.map((s) => ({ id: s.id, sender: null, sentAt: s.sentAt.toISOString(), kind: "text" as const, text: "", editOf: null })) },
      );
      const r = validateOutput(JSON.stringify({ messages: [], operations: [op], unknownCourses: [] }), ctx);
      if (r.ok && r.valid.length) {
        const [batch] = await tx.select({ modelId: aiBatch.modelId, promptVersion: aiBatch.promptVersion }).from(aiBatch).where(eq(aiBatch.id, p.batchId));
        applied += await applyOperations(tx, { studentId, batchId: p.batchId, operations: r.valid, sentAt: new Map(sources.map((s) => [s.id, s.sentAt])), modelId: batch?.modelId ?? "", promptVersion: batch?.promptVersion ?? "" });
      } else if (!(r.ok && r.dropped.every((d) => d.reason === REPEATS || d.reason === SUPERSEDED))) {
        for (const s of sources) missed.add(s.id);
      }
    }
    if (missed.size) await tx.update(inboxMessage).set({ possiblyMissed: true }).where(inArray(inboxMessage.id, [...missed]));
    await tx.update(unknownCourseMention).set({ status: input.action === "add" ? "added" : "mapped", courseId, resolvedAt: now }).where(eq(unknownCourseMention.id, id));
    return { applied, possiblyMissed: missed.size };
  });
  return { ...result, course: await getCourse(studentId, courseId) };
}
