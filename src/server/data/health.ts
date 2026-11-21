// Banners from the health signals (design §10). WhatsApp, AI and paused banners join with #11, #12 and #15.
import { db } from "@/server/db/client";
import { healthSignal } from "@/server/db/schema";
import { evaluateHealth, type Signals } from "@/server/domain/health";

/** The health_signal rows as the domain's Signals. Used by the banners and the worker's heartbeat. */
export async function readSignals(): Promise<Signals> {
  const rows = await db.select().from(healthSignal);
  return Object.fromEntries(rows.map((r) => [r.component, { lastOkAt: r.lastOkAt, lastErrorAt: r.lastErrorAt }]));
}

export const getBanners = async (now = new Date()) => evaluateHealth(await readSignals(), now).banners;
