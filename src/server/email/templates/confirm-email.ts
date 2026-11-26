import { esc, layout } from "./layout";

/** Confirms an address for Course-manager's emails (#82): valid for 24 hours, one use. */
export function confirmEmailEmail(url: string) {
  const subject = "Confirm your email for Course-manager";
  const body = "Open this link to get Course-manager's reminders, digests and alerts at this address. The link works once, for 24 hours. If you didn't ask for this, ignore this email.";
  return {
    subject,
    html: layout(subject, `<p style="margin:0 0 16px">${esc(body)}</p><p style="margin:0"><a href="${esc(url)}" style="color:#0f766e;font-weight:600">Confirm this email</a></p>`),
    text: `${subject}\n\n${body}\n\nConfirm this email: ${url}`,
  };
}
