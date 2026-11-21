// Runs the scheduler's jobs once, at a chosen time, against the database in DATABASE_URL. Real emails are sent
// through Resend (RESEND_API_KEY, EMAIL_FROM). For checking that a Final Reminder and a digest reach Gmail (#9).
//   npx tsx scripts/run-scheduler.ts                                  now
//   npx tsx scripts/run-scheduler.ts --at 2026-11-22T07:30:00+05:30   e.g. inside the digest window
import { parseArgs } from "node:util";
import { pool } from "@/server/db/client";
import { runDigest, runFinalReminders } from "../src/worker/scheduler/jobs";

const { values } = parseArgs({ options: { at: { type: "string" } } });
const now = values.at ? new Date(values.at) : new Date();
if (Number.isNaN(+now)) throw new Error("--at must be an ISO date-time, e.g. 2026-11-22T07:30:00+05:30");
await runFinalReminders(now);
await runDigest(now);
const { rows } = await pool.query("select kind, status, subject, error from email_log order by created_at desc limit 5");
console.table(rows);
await pool.end();
