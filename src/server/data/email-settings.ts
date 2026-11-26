// Settings → Email (U46, #82): emails go to a confirmed address. A new address gets a one-use link valid for 24 hours;
// only a hash of its token is stored. Sign-in, password resets and the account-deleted email keep the login email.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/server/db/client";
import { emailLog, user } from "@/server/db/schema";
import { sendEmail } from "@/server/email/resend";
import { confirmEmailEmail } from "@/server/email/templates/confirm-email";
import { AppError, notFound } from "@/server/http/errors";
import type { EmailSetting } from "@/shared/schemas/settings";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function getEmailSetting(studentId: string): Promise<EmailSetting> {
  const [u] = await db.select({ email: user.email, notify: user.notifyEmail, pending: user.notifyEmailPending }).from(user).where(eq(user.id, studentId));
  if (!u) throw notFound("Account");
  return { address: u.notify ?? u.email, pending: u.pending, loginEmail: u.email };
}

export async function requestEmail(studentId: string, email: string): Promise<EmailSetting> {
  const current = await getEmailSetting(studentId);
  if (email === current.loginEmail.toLowerCase()) return clearEmail(studentId);
  if (email === current.address.toLowerCase()) return current; // already in use: nothing to confirm
  // At most 3 confirmation emails an hour, counted in the email log so it holds across restarts.
  const [sent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(emailLog)
    .where(and(eq(emailLog.studentId, studentId), eq(emailLog.kind, "email_confirm"), gt(emailLog.createdAt, new Date(Date.now() - 3_600_000))));
  if ((sent?.n ?? 0) >= 3) throw new AppError("RATE_LIMITED", "Too many confirmation emails. Try again in an hour.");
  const token = randomBytes(32).toString("base64url");
  await db
    .update(user)
    .set({ notifyEmailPending: email, notifyEmailTokenHash: hash(token), notifyEmailExpiresAt: new Date(Date.now() + 86_400_000) })
    .where(eq(user.id, studentId));
  // The link opens a page with a Confirm button: mail scanners that open links can't confirm on their own.
  const url = `${process.env.APP_ORIGIN ?? ""}/confirm-email?token=${token}`;
  const res = await sendEmail(studentId, "email_confirm", { to: email, ...confirmEmailEmail(url) });
  if (!res.ok) {
    await db.update(user).set({ notifyEmailPending: null, notifyEmailTokenHash: null, notifyEmailExpiresAt: null }).where(eq(user.id, studentId));
    throw new AppError("INTERNAL", "Couldn't send the confirmation email. Try again.");
  }
  return getEmailSetting(studentId);
}

/** Opening the link: the pending address becomes the one emails go to. True when it was valid. */
export async function confirmEmail(token: string, now = new Date()) {
  // One statement: the link is used up and the address takes over together.
  const rows = await db
    .update(user)
    .set({ notifyEmail: sql`${user.notifyEmailPending}`, notifyEmailPending: null, notifyEmailTokenHash: null, notifyEmailExpiresAt: null })
    .where(and(eq(user.notifyEmailTokenHash, hash(token)), gt(user.notifyEmailExpiresAt, now), sql`${user.notifyEmailPending} is not null`))
    .returning({ id: user.id });
  return rows.length > 0;
}

export async function clearEmail(studentId: string): Promise<EmailSetting> {
  await db.update(user).set({ notifyEmail: null, notifyEmailPending: null, notifyEmailTokenHash: null, notifyEmailExpiresAt: null }).where(eq(user.id, studentId));
  return getEmailSetting(studentId);
}
