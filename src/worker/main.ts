// The worker (design §8): takes the single-instance lock, then starts its loops. #9 adds the scheduler;
// the WhatsApp Link and AI loops arrive with #11 and #12.
import { Client } from "pg";
import { recordSchedulerHealth, tick } from "./scheduler/tick";

const log = (level: string, msg: string, extra: object = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));

// A dedicated connection, outside any pool, holds the lock for the process's life: WhatsApp drops one of two connections.
const lock = new Client({ connectionString: process.env.DATABASE_URL });
await lock.connect();
const { rows } = await lock.query("select pg_try_advisory_lock(hashtext('course-manager-worker')) as ok");
if (!rows[0]?.ok) {
  log("error", "another worker holds the lock; exiting");
  process.exit(1);
}
// Losing the lock connection, by error or a clean close, means another worker could start: stop at once.
const lockLost = (reason: string) => {
  log("error", "lock connection lost; exiting so Compose restarts the worker", { reason });
  process.exit(1);
};
lock.on("error", (e) => lockLost(e.message));
lock.on("end", () => lockLost("connection closed"));
log("info", "worker started");

const stop = async () => {
  lock.removeAllListeners("end");
  await lock.end();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);

// Scheduler loop. Its startup check is the Resend key; without it the loop waits and re-checks every 5 minutes,
// and the other loops (later) keep running (design §8).
function startScheduler() {
  if (!process.env.RESEND_API_KEY) {
    log("error", "scheduler not started: RESEND_API_KEY is not set; checking again in 5 minutes");
    void recordSchedulerHealth("RESEND_API_KEY is not set").catch(() => {});
    setTimeout(startScheduler, 5 * 60_000);
    return;
  }
  log("info", "scheduler started");
  const run = () => tick().catch((e) => log("error", "tick failed", { error: (e as Error).message }));
  void run();
  setInterval(run, 60_000);
}
startScheduler();
