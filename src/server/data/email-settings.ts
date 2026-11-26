// Settings → Email (U46, #82): emails go to a confirmed address. A new address gets a one-use link valid for 24 hours;
// only a hash of its token is stored. Sign-in, password resets and the account-deleted email keep the login email.
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/server/db/client";
import { user } from "@/server/db/schema";
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

// At most 3 confirmation emails an hour. shortcut: per web process (one web container).
const sends = new Map<string, number[]>();

export async function requestEmail(studentId: string, email: string): Promise<EmailSetting> {
  const current = await getEmailSetting(studentId);
  if (email === current.loginEmail) return clearEmail(studentId);
  const recent = (sends.get(studentId) ?? []).filter((t) => Date.now() - t < 3_600_000);
  if (recent.length >= 3) throw new AppError("RATE_LIMITED", "Too many confirmation emails. Try again in an hour.");
  sends.set(studentId, [...recent, Date.now()]);
  const token = randomBytes(32).toString("base64url");
  await db
    .update(user)
    .set({ notifyEmailPending: email, notifyEmailTokenHash: hash(token), notifyEmailExpiresAt: new Date(Date.now() + 86_400_000) })
    .where(eq(user.id, studentId));
  const url = `${process.env.APP_ORIGIN ?? ""}/api/v1/email-confirm?token=${token}`;
  await sendEmail(studentId, "email_confirm", { to: email, ...confirmEmailEmail(url) });
  return getEmailSetting(studentId);
}

/** Opening the link: the pending address becomes the one emails go to. True when it was valid. */
export async function confirmEmail(token: string, now = new Date()) {
  const [row] = await db
    .update(user)
    .set({ notifyEmailTokenHash: null, notifyEmailExpiresAt: null })
    .where(and(eq(user.notifyEmailTokenHash, hash(token)), gt(user.notifyEmailExpiresAt, now)))
    .returning({ id: user.id, pending: user.notifyEmailPending });
  if (!row?.pending) return false;
  await db.update(user).set({ notifyEmail: row.pending, notifyEmailPending: null }).where(eq(user.id, row.id));
  return true;
}

export async function clearEmail(studentId: string): Promise<EmailSetting> {
  await db.update(user).set({ notifyEmail: null, notifyEmailPending: null, notifyEmailTokenHash: null, notifyEmailExpiresAt: null }).where(eq(user.id, studentId));
  return getEmailSetting(studentId);
}
