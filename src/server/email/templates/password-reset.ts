import { esc, layout } from "./layout";

/** The reset link (design file 36): valid for 1 hour, one use. */
export function passwordResetEmail(url: string) {
  const subject = "Reset your Course-manager password";
  const body = "Someone asked to reset your password. The link works once, for 1 hour. If it wasn't you, ignore this email: your password stays as it is.";
  return {
    subject,
    html: layout(subject, `<p style="margin:0 0 16px">${esc(body)}</p><p style="margin:0"><a href="${esc(url)}" style="color:#0f766e;font-weight:600">Set a new password</a></p>`),
    text: `${subject}\n\n${body}\n\nSet a new password: ${url}`,
  };
}
