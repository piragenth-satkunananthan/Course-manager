import { esc, layout } from "./layout";

/** The confirmation after deletion (design file 36), sent to the address read before the account was deleted. */
export function accountDeletedEmail() {
  const subject = "Your Course-manager account was deleted";
  const body =
    "Your account and everything in it (Semesters, Courses, timetable, Assignments, Exams, the stored WhatsApp messages and the Activity Log) has been deleted, and WhatsApp is being unlinked. If Course-manager still shows in WhatsApp → Linked devices after a few minutes, remove it there. Backups age out within 7 days.";
  return { subject, html: layout(subject, `<p style="margin:0">${esc(body)}</p>`), text: `${subject}\n\n${body}` };
}
