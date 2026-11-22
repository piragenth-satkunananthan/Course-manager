// Applies validated AI operations (design §9, file 64a), inside the caller's transaction: each through writeEntity
// (actor ai, setAt = its source message's sent time), then an Auto Change with its summary, risk and sources.
// A write that changes nothing makes no Auto Change. Shared by the worker and Unknown Course resolution (#14).
import { and, eq } from "drizzle-orm";
import type { Tx } from "@/server/db/client";
import { assignment, autoChange, autoChangeSource, classSession, course, entityVersion, exam, semester, sessionChange } from "@/server/db/schema";
import { riskOf } from "@/server/domain/auto-change";
import { formatDate } from "@/lib/format";
import { activeChangeFor, checkSessionChange } from "@/server/data/timetable";
import { type EntityType, snapshot, writeEntity } from "@/server/data/write-entity";
import { AppError } from "@/server/http/errors";
import { CHANGE_KIND, type Operation } from "@/shared/schemas/ai-ops";

type When = { date: string | null; time: string | null };
const when = (d: string | null | undefined, t: string | null | undefined): string => (d ? `${formatDate(d)}${t ? `, ${t}` : ""}` : "date TBA");
type Base = { studentId: string; actor: "ai"; setAt: string };
/** What one write did, for its Auto Change; null when it changed nothing. */
type Done = { entityType: EntityType; row: { id: string; version: number }; kind: "create" | "update" | "delete"; summary: string; risk: "normal" | "moved_later" | "cancelled" } | null;
const noDto = async () => null;

type AssessmentOp = Extract<Operation, { op: "create_assignment" | "update_assignment" | "cancel_assignment" | "create_exam" | "update_exam" | "cancel_exam" }>;
const isAssessmentOp = (op: Operation): op is AssessmentOp => /_(assignment|exam)$/.test(op.op);

async function applyAssessment(tx: Tx, base: Base, op: AssessmentOp): Promise<Done> {
  const isA = op.op.endsWith("_assignment");
  const entityType = isA ? ("assignment" as const) : ("exam" as const);
  const table = isA ? assignment : exam;
  const dateOf = (r: Record<string, unknown>): When => ({ date: (isA ? r.dueDate : r.date) as string | null, time: (isA ? r.dueTime : r.startTime) as string | null });

  let result: { row: Record<string, unknown> & { id: string; version: number }; noChange: boolean };
  let before: Record<string, unknown> | null = null;
  let kind: "create" | "update" | "delete";
  if (op.op === "create_assignment" || op.op === "create_exam") {
    const proposed = Object.fromEntries(Object.entries(op).filter(([k]) => k !== "op" && k !== "sourceMessageIds"));
    kind = "create";
    result = await writeEntity(tx, { ...base, entityType, op: "create", proposed });
  } else {
    const entityId = "assignmentId" in op ? op.assignmentId : op.examId;
    const [row] = await tx.select().from(table).where(and(eq(table.studentId, base.studentId), eq(table.id, entityId)));
    before = row ? snapshot(entityType, row) : null;
    kind = op.op.startsWith("cancel") ? "delete" : "update";
    result =
      kind === "delete"
        ? await writeEntity(tx, { ...base, entityType, op: "delete", entityId, toDto: noDto })
        : await writeEntity(tx, { ...base, entityType, op: "update", entityId, proposed: (op as { fields: Record<string, unknown> }).fields, toDto: noDto });
  }
  if (result.noChange) return null; // a repeat or an older message: nothing to log or undo

  const after = snapshot(entityType, result.row);
  const title = String(after.title);
  const b = before && dateOf(before);
  const n = dateOf(after);
  const summary =
    kind === "create"
      ? `${title}: ${isA ? "due" : "on"} ${when(n.date, n.time)}`
      : kind === "delete"
        ? `${title} cancelled`
        : b && (b.date !== n.date || b.time !== n.time)
          ? `${title}: ${when(b.date, b.time)} → ${when(n.date, n.time)}`
          : `${title} updated`;
  return { entityType, row: result.row, kind, summary, risk: riskOf(kind, b, n) };
}

// ---- The timetable and the Semester (#16) ----

type ChangeRow = typeof sessionChange.$inferSelect;
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** "CS2010 lecture Tue 24 Nov" and the like, for the Auto Change summary. */
async function describe(tx: Tx, studentId: string, c: { courseId: string; classSessionId: string | null; sessionKind: string | null }) {
  const [co] = await tx.select({ code: course.code }).from(course).where(and(eq(course.studentId, studentId), eq(course.id, c.courseId)));
  const [s] = c.classSessionId ? await tx.select({ kind: classSession.kind }).from(classSession).where(and(eq(classSession.studentId, studentId), eq(classSession.id, c.classSessionId))) : [];
  return `${co?.code ?? "Class"} ${s?.kind ?? c.sessionKind ?? "class"}`;
}

/** The summary and risk of a Session Change as it is after the write. Cancelling a class, or an extra one, is risky (U3). */
async function sessionSummary(tx: Tx, studentId: string, row: ChangeRow, removed: boolean): Promise<{ summary: string; risk: "normal" | "cancelled" }> {
  const what = await describe(tx, studentId, row);
  const at = `${formatDate(row.newDate ?? row.originalDate!)}, ${hhmm(row.newStartTime)}–${hhmm(row.newEndTime)}${row.newLocation ? `, ${row.newLocation}` : ""}`;
  if (row.kind === "extra") return removed ? { summary: `Extra ${what} ${formatDate(row.newDate!)} cancelled`, risk: "cancelled" } : { summary: `Extra ${what} ${at}`, risk: "normal" };
  if (removed) return { summary: `${what} ${formatDate(row.originalDate!)} is back on`, risk: "normal" };
  if (row.kind === "cancel") return { summary: `${what} ${formatDate(row.originalDate!)} cancelled`, risk: "cancelled" };
  return { summary: `${what} ${formatDate(row.originalDate!)} → ${at}`, risk: "normal" };
}

type TimetableOp = Exclude<Operation, AssessmentOp>;

async function applyTimetable(tx: Tx, base: Base, op: TimetableOp): Promise<Done> {
  const { studentId } = base;
  if (op.op === "extend_semester") {
    const [s] = await tx.select({ endDate: semester.endDate }).from(semester).where(and(eq(semester.studentId, studentId), eq(semester.id, op.semesterId)));
    const r = await writeEntity(tx, { ...base, entityType: "semester", op: "update", entityId: op.semesterId, proposed: { endDate: op.newEndDate }, toDto: noDto });
    if (r.noChange) return null;
    return { entityType: "semester", row: r.row, kind: "update", summary: `Semester ends ${formatDate(s!.endDate)} → ${formatDate(op.newEndDate)}`, risk: "normal" };
  }

  // Each occurrence has at most one active change: naming the occurrence again updates it, never duplicates it (§9).
  let existing: ChangeRow | undefined;
  let kind: "create" | "update" | "delete";
  let r: { row: Record<string, unknown> & { id: string; version: number }; noChange: boolean };
  const change = (id: string) => tx.select().from(sessionChange).where(and(eq(sessionChange.studentId, studentId), eq(sessionChange.id, id))).then((x) => x[0]);
  switch (op.op) {
    case "cancel_occurrence":
    case "reschedule_occurrence": {
      existing = await activeChangeFor(tx, studentId, op.classSessionId, op.date);
      const fields =
        op.op === "cancel_occurrence"
          ? { kind: "cancel", newDate: null, newStartTime: null, newEndTime: null, newLocation: null }
          : { kind: "reschedule", newDate: op.newDate, newStartTime: op.newStart, newEndTime: op.newEnd, ...(op.newLocation ? { newLocation: op.newLocation } : {}) };
      if (existing) {
        kind = "update";
        r = await writeEntity(tx, { ...base, entityType: "session_change", op: "update", entityId: existing.id, proposed: fields, toDto: noDto });
      } else {
        const [s] = await tx.select({ courseId: classSession.courseId }).from(classSession).where(and(eq(classSession.studentId, studentId), eq(classSession.id, op.classSessionId)));
        kind = "create";
        r = await writeEntity(tx, { ...base, entityType: "session_change", op: "create", proposed: { courseId: s!.courseId, classSessionId: op.classSessionId, originalDate: op.date, ...fields } });
      }
      break;
    }
    case "add_extra_session":
      kind = "create";
      r = await writeEntity(tx, {
        ...base, entityType: "session_change", op: "create",
        proposed: { courseId: op.courseId, kind: "extra", sessionKind: op.kind, newDate: op.date, newStartTime: op.start, newEndTime: op.end, newLocation: op.location },
      });
      break;
    case "update_session_change": {
      const f = op.fields;
      kind = "update";
      // A change turned into a cancellation drops its new date and times, as cancel_occurrence does.
      const cancel = f.kind === "cancelled" ? { newDate: null, newStartTime: null, newEndTime: null, newLocation: null } : {};
      const proposed = { kind: f.kind && CHANGE_KIND[f.kind], newDate: f.newDate, newStartTime: f.newStart, newEndTime: f.newEnd, newLocation: f.newLocation, ...cancel };
      r = await writeEntity(tx, { ...base, entityType: "session_change", op: "update", entityId: op.sessionChangeId, proposed: Object.fromEntries(Object.entries(proposed).filter(([, v]) => v !== undefined)), toDto: noDto });
      break;
    }
    case "remove_session_change":
      kind = "delete";
      r = await writeEntity(tx, { ...base, entityType: "session_change", op: "delete", entityId: op.sessionChangeId, toDto: noDto });
      break;
  }
  if (r.noChange) return null;
  if (kind !== "delete") await checkSessionChange(tx, studentId, r.row); // validation should have caught it; this keeps the rows sound
  const row = await change(r.row.id);
  // Re-cancelling a rescheduled class is a cancellation; moving a cancelled one back is not.
  const { summary, risk } = await sessionSummary(tx, studentId, row!, kind === "delete");
  return { entityType: "session_change", row: r.row, kind, summary, risk };
}

export async function applyOperations(
  tx: Tx,
  a: { studentId: string; batchId: string; operations: Operation[]; sentAt: Map<string, Date>; modelId: string; promptVersion: string },
) {
  let applied = 0;
  const failed: string[] = []; // source messages of operations that couldn't be applied: the caller flags them Possibly Missed
  // Extensions first, so a change in the new weeks passes the Semester check (validation already allowed it).
  const ordered = [...a.operations].sort((x, y) => Number(y.op === "extend_semester") - Number(x.op === "extend_semester"));
  for (const op of ordered) {
    // The message's time decides "most recently sent wins"; for several sources, the latest.
    const setAt = new Date(
      Math.max(
        ...op.sourceMessageIds.map((id) => {
          const t = a.sentAt.get(id);
          if (!t) throw new Error("operation source isn't in the batch"); // validation drops these; never write with a 1970 time
          return +t;
        }),
      ),
    ).toISOString();
    const base = { studentId: a.studentId, actor: "ai" as const, setAt };
    // Each operation in its own savepoint: one that breaks a rule validation couldn't see (a field kept by "most
    // recently sent wins", a row gone meanwhile) is dropped alone, never the whole batch (design §9, rule 1).
    let done: Done;
    try {
      done = await tx.transaction((sp) => (isAssessmentOp(op) ? applyAssessment(sp, base, op) : applyTimetable(sp, base, op)));
    } catch (e) {
      if (!(e instanceof AppError)) throw e;
      failed.push(...op.sourceMessageIds);
      continue;
    }
    if (!done) continue;

    const [change] = await tx
      .insert(autoChange)
      .values({ studentId: a.studentId, batchId: a.batchId, entityType: done.entityType, entityId: done.row.id, op: done.kind, afterVersion: done.row.version, summary: done.summary, risk: done.risk, modelId: a.modelId, promptVersion: a.promptVersion })
      .returning({ id: autoChange.id });
    await tx.insert(autoChangeSource).values(op.sourceMessageIds.map((inboxMessageId) => ({ autoChangeId: change!.id, inboxMessageId })));
    await tx
      .update(entityVersion)
      .set({ autoChangeId: change!.id })
      .where(and(eq(entityVersion.studentId, a.studentId), eq(entityVersion.entityType, done.entityType), eq(entityVersion.entityId, done.row.id), eq(entityVersion.version, done.row.version)));
    applied++;
  }
  return { applied, failed };
}
