// The worker (design §8). #5 only takes the single-instance lock; the four loops arrive with #9 and #11.
import { Client } from "pg";

const log = (level: string, msg: string, extra: object = {}) => console.log(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...extra }));

// A dedicated connection, outside any pool, holds the lock for the process's life: WhatsApp drops one of two connections.
const lock = new Client({ connectionString: process.env.DATABASE_URL });
await lock.connect();
const { rows } = await lock.query("select pg_try_advisory_lock(hashtext('course-manager-worker')) as ok");
if (!rows[0]?.ok) {
  log("error", "another worker holds the lock; exiting");
  process.exit(1);
}
lock.on("error", (e) => {
  log("error", "lock connection lost; exiting so Compose restarts the worker", { error: e.message });
  process.exit(1);
});
log("info", "worker started");

const stop = async () => {
  await lock.end();
  process.exit(0);
};
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
setInterval(() => {}, 1 << 30); // shortcut: idles until #9 and #11 add the scheduler and WhatsApp loops
