// The one write path for every AI-writable item (design file 37), used by Student edits now and the AI applier in #12.
// Optimistic locking, "most recently sent wins" per field, no-op skipping, a version bump, and a history row.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { db } from "@/server/db/client";
import { assignment, entityVersion, exam, sessionChange } from "@/server/db/schema";
import { planFieldUpdate } from "@/server/domain/versioning";
import { AppError, notFound } from "@/server/http/errors";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Actor = "ai" | "student" | "system";
type VersionedTable = PgTable & { id: PgColumn; studentId: PgColumn; deletedAt: PgColumn; version: PgColumn };

/** Per entity: its table, the fields each actor may write (§3: the Student owns status, the AI only these). */
const ENTITIES = {
  assignment: {
    table: assignment as unknown as VersionedTable,
    fields: ["courseId", "title", "description", "dueDate", "dueTime", "submitWhere", "isGroupWork"],
    ai: ["title", "description", "dueDate", "dueTime", "submitWhere", "isGroupWork"],
  },
  exam: {
    table: exam as unknown as VersionedTable,
    fields: ["courseId", "title", "kindLabel", "date", "startTime", "location", "topics"],
    ai: ["courseId", "title", "kindLabel", "date", "startTime", "location", "topics"], // §3: every field except source
  },
  session_change: {
    table: sessionChange as unknown as VersionedTable,
    fields: ["courseId", "classSessionId", "kind", "sessionKind", "originalDate", "newDate", "newStartTime", "newEndTime", "newLocation"],
    ai: ["kind", "newDate", "newStartTime", "newEndTime", "newLocation"], // §9 update_session_change
  },
} as const;
export type EntityType = keyof typeof ENTITIES;

type Row = Record<string, unknown> & { id: string; version: number; fieldSetAt: Record<string, string> };

/** The comparable values of a row's writable fields. Postgres returns times as "HH:mm:ss"; the API speaks "HH:mm". */
export function snapshot(entityType: EntityType, row: Record<string, unknown>) {
  return Object.fromEntries(
    ENTITIES[entityType].fields.map((f) => {
      const v = row[f];
      return [f, typeof v === "string" && /^\d{2}:\d{2}:\d{2}$/.test(v) ? v.slice(0, 5) : (v ?? null)];
    }),
  );
}

type Base = { studentId: string; entityType: EntityType; actor: Actor; setAt: string }; // setAt: the message's sent time for the AI, now for the Student
type Write = Base &
  (
    | { op: "create"; proposed: Record<string, unknown> }
    | { op: "update" | "delete"; entityId: string; proposed?: Record<string, unknown>; expectedVersion?: number; toDto: (row: Row) => Promise<unknown> } // toDto: the CONFLICT body
  );

/** One history row. Also used for status changes, which don't go through writeEntity (§3). */
export function recordHistory(
  tx: Tx,
  h: { studentId: string; entityType: EntityType; entityId: string; version: number; op: "create" | "update" | "delete" | "status"; actor: Actor; before: object | null; after: object | null; beforeFieldSetAt?: object | null },
) {
  return tx.insert(entityVersion).values({
    ...h,
    before: h.before as Record<string, unknown> | null,
    after: h.after as Record<string, unknown> | null,
    beforeFieldSetAt: (h.beforeFieldSetAt ?? null) as Record<string, string> | null,
  });
}

export async function writeEntity(tx: Tx, w: Write): Promise<{ row: Row; noChange: boolean }> {
  const { table, fields, ai } = ENTITIES[w.entityType];
  const owned: readonly string[] = w.actor === "ai" ? ai : fields;
  const history = (row: Row, op: "create" | "update" | "delete", before: object | null, after: object | null, beforeFieldSetAt: object | null) =>
    recordHistory(tx, { studentId: w.studentId, entityType: w.entityType, entityId: row.id, version: row.version, op, actor: w.actor, before, after, beforeFieldSetAt });
  const mine = (id: string) => and(eq(table.id, id), eq(table.studentId, w.studentId));

  if (w.op === "create") {
    // Ownership limits edits, not creation: an AI create names its Course too. The source records who created it.
    const values = Object.fromEntries(Object.entries(w.proposed).filter(([k, v]) => fields.includes(k as never) && v !== undefined));
    const fieldSetAt = Object.fromEntries(Object.keys(values).map((k) => [k, w.setAt]));
    const source = w.actor === "ai" ? "ai" : "manual";
    const [row] = (await tx.insert(table).values({ ...values, studentId: w.studentId, source, fieldSetAt } as never).returning()) as Row[];
    await history(row!, "create", null, snapshot(w.entityType, row!), null);
    return { row: row!, noChange: false };
  }

  const [current] = (await tx.select().from(table).where(and(mine(w.entityId), isNull(table.deletedAt))).for("update")) as Row[];
  if (!current) throw notFound("Item");
  if (w.expectedVersion !== undefined && w.expectedVersion !== current.version)
    throw new AppError("CONFLICT", "This item just changed. It has been reloaded with the latest values.", { current: await w.toDto(current) });

  const before = snapshot(w.entityType, current);
  if (w.op === "delete") {
    // A soft delete. History records deletedAt itself, so Undo (#12) can write the before value back.
    const deletedAt = new Date();
    const [row] = (await tx
      .update(table)
      .set({ deletedAt, version: sql`${table.version} + 1` } as never)
      .where(mine(current.id))
      .returning()) as Row[];
    await history(row!, "delete", { ...before, deletedAt: null }, { deletedAt: deletedAt.toISOString() }, current.fieldSetAt);
    return { row: row!, noChange: false };
  }

  const plan = planFieldUpdate(before, current.fieldSetAt, w.proposed ?? {}, w.setAt, owned, w.actor);
  if (plan.noChange) return { row: current, noChange: true };
  const [row] = (await tx
    .update(table)
    .set({ ...plan.fields, fieldSetAt: plan.newFieldSetAt, version: sql`${table.version} + 1` } as never)
    .where(mine(current.id))
    .returning()) as Row[];
  await history(row!, "update", Object.fromEntries(Object.keys(plan.fields).map((k) => [k, before[k]])), plan.fields, current.fieldSetAt);
  return { row: row!, noChange: false };
}
