// One scheduler tick (every 60 s): each job runs on its own, so a failure in one never stops the other.
import { healthSignal } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { log } from "@/server/log";
import { runDigest, runFinalReminders } from "./jobs";

export async function tick(now = new Date()) {
  const failed: string[] = [];
  for (const [name, job] of [["final reminders", runFinalReminders], ["digest", runDigest]] as const) {
    try {
      await job(now);
    } catch (e) {
      failed.push(name);
      log.error("scheduler job failed", { job: name, error: e });
    }
  }
  await recordSchedulerHealth(failed.length ? `failed: ${failed.join(", ")}` : null, now);
}

/** health_signal(scheduler): healthy only when every job ran (§8: a failed loop records the error). */
export async function recordSchedulerHealth(error: string | null, now = new Date()) {
  const set = error ? { lastErrorAt: now, detail: error } : { lastOkAt: now, detail: null };
  await db.insert(healthSignal).values({ component: "scheduler", ...set }).onConflictDoUpdate({ target: healthSignal.component, set });
}
