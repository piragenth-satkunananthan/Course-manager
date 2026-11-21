// Banners from the health signals and the WhatsApp Link (design §10). AI and paused banners join with #12 and #15.
import { eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { healthSignal, waSession } from "@/server/db/schema";
import { evaluateHealth, type Signals } from "@/server/domain/health";

/** The health_signal rows as the domain's Signals. Used by the banners and the worker's heartbeat. */
export async function readSignals(): Promise<Signals> {
  const rows = await db.select().from(healthSignal);
  return Object.fromEntries(rows.map((r) => [r.component, { lastOkAt: r.lastOkAt, lastErrorAt: r.lastErrorAt }]));
}

/** At most two, most severe first (design-system §6.10): WhatsApp disconnected, then the worker. */
export async function getBanners(studentId: string, now = new Date()) {
  const [s] = await db.select({ status: waSession.status, disconnectedAt: waSession.disconnectedAt }).from(waSession).where(eq(waSession.studentId, studentId));
  const whatsapp =
    s && (s.status === "logged_out" || (s.status === "error" && s.disconnectedAt)) ? [{ kind: "whatsapp_disconnected" as const, since: s.disconnectedAt?.toISOString() ?? null }] : [];
  return [...whatsapp, ...evaluateHealth(await readSignals(), now).banners];
}
