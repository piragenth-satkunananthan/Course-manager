// The one write path for every AI-writable item (design file 37), used by Student edits now and the AI applier in #12.
// Optimistic locking, "most recently sent wins" per field, no-op skipping, a version bump, and a history row.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { db } from "@/server/db/client";
import { assignment, entityVersion, exam } from "@/server/db/schema";
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
    ai: ["title", "kindLabel", "date", "startTime", "location", "topics"],
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

type Write = {
  studentId: string;
  entityType: EntityType;
  actor: Actor;
  setAt: string; // ISO instant: the message's sent time for the AI, now for the Student
  toDto: (row: Row) => Promise<unknown>; // for the CONFLICT body
} & (
  | { op: "create"; proposed: Record<string, unknown> }
  | { op: "update"; entityId: string; proposed: Record<string, unknown>; expectedVersion?: number }
  | { op: "delete"; entityId: string; expectedVersion?: number }
);

export async function writeEntity(tx: Tx, w: Write): Promise<{ row: Row; noChange: boolean }> {
  const { table, fields, ai } = ENTITIES[w.entityType];
  const owned: readonly string[] = w.actor === "ai" ? ai : fields;
  const history = (row: Row, op: "create" | "update" | "delete", before: object | null, after: object | null, beforeFieldSetAt: object | null) =>
    tx.insert(entityVersion).values({
      studentId: w.studentId, entityType: w.entityType, entityId: row.id, version: row.version, op, actor: w.actor,
      before: before as Record<string, unknown> | null, after: after as Record<string, unknown> | null, beforeFieldSetAt: beforeFieldSetAt as Record<string, string> | null,
    });

  if (w.op === "create") {
    const values = Object.fromEntries(Object.entries(w.proposed).filter(([k, v]) => owned.includes(k) && v !== undefined));
    const fieldSetAt = Object.fromEntries(Object.keys(values).map((k) => [k, w.setAt]));
    const [row] = (await tx.insert(table).values({ ...values, studentId: w.studentId, fieldSetAt } as never).returning()) as Row[];
    await history(row!, "create", null, snapshot(w.entityType, row!), null);
    return { row: row!, noChange: false };
  }

  const [current] = (await tx
    .select()
    .from(table)
    .where(and(eq(table.id, w.entityId), eq(table.studentId, w.studentId), isNull(table.deletedAt)))
    .for("update")) as Row[];
  if (!current) throw notFound("Item");
  if (w.expectedVersion !== undefined && w.expectedVersion !== current.version)
    throw new AppError("CONFLICT", "This item just changed. It has been reloaded with the latest values.", { current: await w.toDto(current) });

  const before = snapshot(w.entityType, current);
  if (w.op === "delete") {
    const [row] = (await tx
      .update(table)
      .set({ deletedAt: new Date(), version: sql`${table.version} + 1` } as never)
      .where(eq(table.id, current.id))
      .returning()) as Row[];
    await history(row!, "delete", before, null, current.fieldSetAt);
    return { row: row!, noChange: false };
  }

  const plan = planFieldUpdate(before, current.fieldSetAt, w.proposed, w.setAt, owned);
  if (plan.noChange) return { row: current, noChange: true };
  const [row] = (await tx
    .update(table)
    .set({ ...plan.fields, fieldSetAt: plan.newFieldSetAt, version: sql`${table.version} + 1` } as never)
    .where(eq(table.id, current.id))
    .returning()) as Row[];
  await history(row!, "update", Object.fromEntries(Object.keys(plan.fields).map((k) => [k, before[k]])), plan.fields, current.fieldSetAt);
  return { row: row!, noChange: false };
}
