// One scheduler tick (every 60 s): each job runs on its own, so a failure in one never stops the other.
import { healthSignal } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { log } from "@/server/log";
import { runDigest, runFinalReminders } from "./jobs";

export async function tick(now = new Date()) {
  for (const [name, job] of [["final reminders", runFinalReminders], ["digest", runDigest]] as const) {
    try {
      await job(now);
    } catch (e) {
      log.error("scheduler job failed", { job: name, error: e });
    }
  }
  await db.insert(healthSignal).values({ component: "scheduler", lastOkAt: now }).onConflictDoUpdate({ target: healthSignal.component, set: { lastOkAt: now } });
}
