// The worker (design §8): takes the single-instance lock, then starts its loops independently: the scheduler,
// the WhatsApp Link with its request poller, and (#12) the AI processor. A failed startup check stops only its loop.
import { Client } from "pg";
import { loadKey } from "@/server/crypto";
import { db } from "@/server/db/client";
import { healthSignal, user, waSession } from "@/server/db/schema";
import { startPoller } from "./poller";
import { raiseAlert } from "./scheduler/alerts";
import { recordSchedulerHealth, tick } from "./scheduler/tick";
import { Ingest } from "./whatsapp/ingest";
import { WhatsAppLink } from "./whatsapp/link";

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

let whatsapp: WhatsAppLink | null = null;
const stop = async () => {
  whatsapp?.stop();
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

// WhatsApp loop. Startup check: the encryption key loads and there is exactly one Student (v1, design file 58).
async function startWhatsApp() {
  try {
    const key = loadKey();
    const students = await db.select({ id: user.id }).from(user);
    if (students.length !== 1) throw new Error(`expected exactly one Student, found ${students.length}`);
    const studentId = students[0]!.id;
    await db.insert(waSession).values({ studentId }).onConflictDoNothing();
    const ingest = new Ingest(studentId, key);
    await ingest.reloadGroups();
    whatsapp = new WhatsAppLink(studentId, key, ingest);
    await whatsapp.start();
    await startPoller(studentId, whatsapp, ingest);
    log("info", "whatsapp loop started");
  } catch (e) {
    const detail = (e as Error).message;
    log("error", "whatsapp loop not started; checking again in 5 minutes", { error: detail });
    const now = new Date();
    await db.insert(healthSignal).values({ component: "wa_socket", lastErrorAt: now, detail }).onConflictDoUpdate({ target: healthSignal.component, set: { lastErrorAt: now, detail } }).catch(() => {});
    const students = await db.select({ id: user.id }).from(user).catch(() => []);
    if (students.length === 1) await raiseAlert(students[0]!.id, "whatsapp_not_started", { error: detail }, now).catch(() => {});
    setTimeout(startWhatsApp, 5 * 60_000);
  }
}
void startWhatsApp();
