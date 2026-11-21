// One scheduler tick (every 60 s): each job runs on its own, so a failure in one never stops the other.
import { eq, inArray, sql } from "drizzle-orm";
import { healthSignal, inboxMessage, user } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { readSignals } from "@/server/data/health";
import { evaluateHealth } from "@/server/domain/health";
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
  await pingHeartbeats(now);
}

/** The healthchecks.io reminders check is pinged only while the scheduler and email are healthy (§10). It emails the Student when pings stop. */
async function pingHeartbeats(now: Date) {
  const [waiting] = await db
    .select({ oldest: sql<string | null>`min(${inboxMessage.receivedAt})`, paused: sql<boolean>`bool_or(${user.autoChangesPaused})` })
    .from(inboxMessage)
    .innerJoin(user, eq(user.id, inboxMessage.studentId))
    .where(inArray(inboxMessage.status, ["pending", "processing"]));
  const health = evaluateHealth(await readSignals(), now, { oldestWaitingMs: waiting?.oldest ? +now - +new Date(waiting.oldest) : null, paused: !!waiting?.paused });
  // reminders: scheduler and email healthy. capture: WhatsApp and the AI healthy (design §10).
  for (const [check, url, ok] of [["reminders", process.env.HEALTHCHECK_REMINDERS_URL, health.pingReminders], ["capture", process.env.HEALTHCHECK_CAPTURE_URL, health.pingCapture]] as const) {
    if (!url || !ok) continue;
    try {
      await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (e) {
      log.warn("heartbeat ping failed", { check, error: e });
    }
  }
}

/** health_signal(scheduler): healthy only when every job ran (§8: a failed loop records the error). */
export async function recordSchedulerHealth(error: string | null, now = new Date()) {
  const set = error ? { lastErrorAt: now, detail: error } : { lastOkAt: now, detail: null };
  await db.insert(healthSignal).values({ component: "scheduler", ...set }).onConflictDoUpdate({ target: healthSignal.component, set });
}
