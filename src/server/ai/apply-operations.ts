// Applies validated AI operations (design §9, file 64a), inside the caller's transaction: each through writeEntity
// (actor ai, setAt = its source message's sent time), then an Auto Change with its summary, risk and sources.
// A write that changes nothing makes no Auto Change. Shared by the worker and (#14) Unknown Course resolution.
import { and, eq } from "drizzle-orm";
import type { db } from "@/server/db/client";
import { assignment, autoChange, autoChangeSource, entityVersion, exam } from "@/server/db/schema";
import { riskOf } from "@/server/domain/auto-change";
import { formatDate } from "@/lib/format";
import { snapshot, writeEntity } from "@/server/data/write-entity";
import type { Operation } from "@/shared/schemas/ai-ops";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type When = { date: string | null; time: string | null };
const when = (d: string | null | undefined, t: string | null | undefined): string => (d ? `${formatDate(d)}${t ? `, ${t}` : ""}` : "date TBA");

/** The operations this ticket applies; timetable and Semester ones arrive with #16 (validation drops them until then). */
type AssessmentOp = Extract<Operation, { op: "create_assignment" | "update_assignment" | "cancel_assignment" | "create_exam" | "update_exam" | "cancel_exam" }>;
const isAssessmentOp = (op: Operation): op is AssessmentOp => /_(assignment|exam)$/.test(op.op);

export async function applyOperations(
  tx: Tx,
  a: { studentId: string; batchId: string; operations: Operation[]; sentAt: Map<string, Date>; modelId: string; promptVersion: string },
) {
  let applied = 0;
  for (const op of a.operations.filter(isAssessmentOp)) {
    // The message's time decides "most recently sent wins"; for several sources, the latest.
    const setAt = new Date(Math.max(...op.sourceMessageIds.map((id) => +(a.sentAt.get(id) ?? 0)))).toISOString();
    const base = { studentId: a.studentId, actor: "ai" as const, setAt };
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
      const [row] = await tx.select().from(table).where(and(eq(table.studentId, a.studentId), eq(table.id, entityId)));
      before = row ? snapshot(entityType, row) : null;
      kind = op.op.startsWith("cancel") ? "delete" : "update";
      result =
        kind === "delete"
          ? await writeEntity(tx, { ...base, entityType, op: "delete", entityId, toDto: async () => null })
          : await writeEntity(tx, { ...base, entityType, op: "update", entityId, proposed: (op as { fields: Record<string, unknown> }).fields, toDto: async () => null });
    }
    if (result.noChange) continue; // a repeat or an older message: nothing to log or undo

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

    const [change] = await tx
      .insert(autoChange)
      .values({ studentId: a.studentId, batchId: a.batchId, entityType, entityId: result.row.id, op: kind, afterVersion: result.row.version, summary, risk: riskOf(kind, b, n), modelId: a.modelId, promptVersion: a.promptVersion })
      .returning({ id: autoChange.id });
    await tx.insert(autoChangeSource).values(op.sourceMessageIds.map((inboxMessageId) => ({ autoChangeId: change!.id, inboxMessageId })));
    await tx
      .update(entityVersion)
      .set({ autoChangeId: change!.id })
      .where(and(eq(entityVersion.entityType, entityType), eq(entityVersion.entityId, result.row.id), eq(entityVersion.version, result.row.version)));
    applied++;
  }
  return applied;
}
