// Account deletion (design file 48): password, then the confirmation email to the address read now, then WhatsApp
// unlinked by the worker (waited for up to 10 seconds), then the user row, which cascades to every other row.
import { eq } from "drizzle-orm";
import { auth } from "@/server/auth";
import { db } from "@/server/db/client";
import { user, waSession } from "@/server/db/schema";
import { sendEmail } from "@/server/email/resend";
import { accountDeletedEmail } from "@/server/email/templates/account-deleted";
import { invalid, notFound } from "@/server/http/errors";
import { log } from "@/server/log";

const WRONG = "That password isn't right";

export async function deleteAccount(studentId: string, password: string, { waitMs = 10_000 } = {}) {
  const ctx = await auth.$context;
  const credential = (await ctx.internalAdapter.findAccounts(studentId)).find((a) => a.providerId === "credential");
  if (!credential?.password || !(await ctx.password.verify({ hash: credential.password, password }))) throw invalid("password", WRONG);
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
  log.info("account deleted", { whatsappUnlinked: unlinked });

  await db.delete(user).where(eq(user.id, studentId)); // cascades to sessions and every other row
  return null;
}
