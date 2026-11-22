// One scheduler tick (every 60 s): each job runs on its own, so a failure in one never stops the other.
import { user } from "@/server/db/schema";
import { db } from "@/server/db/client";
import { readAiState, readSignals, recordHealth } from "@/server/data/health";
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
  const signals = await readSignals();
  const students = await db.select({ id: user.id }).from(user);
  const health = evaluateHealth(signals, now); // with no AI state: reminders, and capture as WhatsApp alone
  // capture also needs every Student's AI healthy (v1 has one).
  for (const s of students) health.pingCapture &&= evaluateHealth(signals, now, await readAiState(s.id, now)).pingCapture;
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
  await recordHealth("scheduler", !error, error, now);
}
