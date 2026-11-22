// Banners from the health signals and the WhatsApp Link (design §10), and the AI state the capture heartbeat reads.
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { healthSignal, inboxMessage, user, waSession } from "@/server/db/schema";
import { evaluateHealth, type Signals } from "@/server/domain/health";

/** The health_signal rows as the domain's Signals. Used by the banners and the worker's heartbeat. */
export async function readSignals(): Promise<Signals> {
  const rows = await db.select().from(healthSignal);
  return Object.fromEntries(rows.map((r) => [r.component, { lastOkAt: r.lastOkAt, lastErrorAt: r.lastErrorAt }]));
}

/**
 * How long the oldest waiting (pending or processing) message has waited, and whether Auto Changes are paused: for one
 * Student, or across all of them for the worker's heartbeat (v1 has one).
 */
export async function readAiState(now: Date, studentId?: string) {
  const [w] = await db
    .select({ oldest: sql<string | null>`min(${inboxMessage.receivedAt})` })
    .from(inboxMessage)
    .where(and(inArray(inboxMessage.status, ["pending", "processing"]), studentId ? eq(inboxMessage.studentId, studentId) : undefined));
  const [p] = await db.select({ paused: sql<boolean>`coalesce(bool_or(${user.autoChangesPaused}), false)` }).from(user).where(studentId ? eq(user.id, studentId) : undefined);
  return { oldestWaitingMs: w?.oldest ? +now - +new Date(w.oldest) : null, paused: !!p?.paused };
}

/** At most two, most severe first (design-system §6.10): WhatsApp disconnected, the worker, the AI, paused. */
export async function getBanners(studentId: string, now = new Date()) {
  const [s] = await db.select({ status: waSession.status, disconnectedAt: waSession.disconnectedAt }).from(waSession).where(eq(waSession.studentId, studentId));
  const whatsapp =
    s && (s.status === "logged_out" || (s.status === "error" && s.disconnectedAt)) ? [{ kind: "whatsapp_disconnected" as const, since: s.disconnectedAt?.toISOString() ?? null }] : [];
  return [...whatsapp, ...evaluateHealth(await readSignals(), now, await readAiState(now, studentId)).banners].slice(0, 2);
}
