import { esc, layout } from "./layout";

/** The confirmation after deletion (design file 36), sent to the address read before the account was deleted. */
export function accountDeletedEmail() {
  const subject = "Your Course-manager account was deleted";
  const body =
    "Your account and everything in it (Semesters, Courses, Assignments, Exams, your timetable and the stored WhatsApp messages) has been deleted, and WhatsApp was unlinked. Backups age out within 7 days.";
  return { subject, html: layout(subject, `<p style="margin:0">${esc(body)}</p>`), text: `${subject}\n\n${body}` };
}
