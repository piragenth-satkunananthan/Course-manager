// Banners from the health signals (design §10). WhatsApp, AI and paused banners join with #11, #12 and #15.
import { db } from "@/server/db/client";
import { healthSignal } from "@/server/db/schema";
import { evaluateHealth } from "@/server/domain/health";

export async function getBanners(now = new Date()) {
  const rows = await db.select().from(healthSignal);
  return evaluateHealth(Object.fromEntries(rows.map((r) => [r.component, { lastOkAt: r.lastOkAt, lastErrorAt: r.lastErrorAt }])), now).banners;
}
