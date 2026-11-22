// Account deletion (design file 48): password, then the confirmation email to the address read now, then WhatsApp
// unlinked by the worker (waited for up to 10 seconds), then the user row, which cascades to every other row.
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { user, waSession } from "@/server/db/schema";
import { sendEmail } from "@/server/email/resend";
import { accountDeletedEmail } from "@/server/email/templates/account-deleted";
import { AppError, invalid, notFound } from "@/server/http/errors";
import { log } from "@/server/log";

const WRONG_PASSWORD = "That password isn't right";

// Password guesses here sit outside Better Auth's limiter: at most 5 wrong ones per Student in 15 minutes.
// shortcut: counted in this web process's memory (one container, v1); move to the rate_limit table if it scales out.
const failures = new Map<string, number[]>();
const WINDOW_MS = 15 * 60_000;

export async function deleteAccount(studentId: string, password: string, { waitMs = 10_000 } = {}) {
  const recent = (failures.get(studentId) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  if (recent.length >= 5) throw new AppError("RATE_LIMITED", "Too many attempts, try again in 15 minutes");
  const ctx = await auth.$context;
  const credential = (await ctx.internalAdapter.findAccounts(studentId)).find((a) => a.providerId === "credential");
  if (!credential?.password || !(await ctx.password.verify({ hash: credential.password, password }))) {
    failures.set(studentId, [...recent, Date.now()]);
    throw invalid("password", WRONG_PASSWORD);
  }
  failures.delete(studentId);
  const [me] = await db.select({ email: user.email }).from(user).where(eq(user.id, studentId));
  if (!me) throw notFound("Account");

  await sendEmail(studentId, "account_deleted", { to: me.email, ...accountDeletedEmail() });

  // The worker logs WhatsApp out (it alone holds the socket); proceed either way after 10 seconds (§8).
  const [wa] = await db.update(waSession).set({ unlinkRequestedAt: new Date() }).where(eq(waSession.studentId, studentId)).returning({ status: waSession.status });
  let unlinked = !wa || wa.status === "unlinked";
  for (const until = Date.now() + waitMs; !unlinked && Date.now() < until; ) {
    await new Promise((r) => setTimeout(r, 250));
    const [s] = await db.select({ status: waSession.status }).from(waSession).where(eq(waSession.studentId, studentId));
    unlinked = !s || s.status === "unlinked";
  }
  // Not unlinked in time: the worker still logs out once it sees the session row gone (poller.ts).
  await db.delete(user).where(eq(user.id, studentId)); // cascades to sessions and every other row
  log.info("account deleted", { whatsappUnlinkedBeforeDelete: unlinked });
  return null;
}
