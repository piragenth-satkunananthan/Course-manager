import type { Deadline } from "@/shared/schemas/dashboard";
import { deadlineLine } from "./deadline-line";
import { esc, layout } from "./layout";

export function finalReminderEmail(d: Deadline, appOrigin: string) {
  const { kind, text } = deadlineLine(d);
  const link = `${appOrigin}/`;
  const subject = `Due in 4 hours: ${d.item.title} (${d.item.courseCode})`;
  return {
    subject,
    html: layout(subject, `<p style="margin:0 0 16px">${esc(kind)}: <strong>${esc(text)}</strong></p>
<p style="margin:0"><a href="${esc(link)}" style="color:#0f766e;font-weight:600">Open Course-manager</a> to mark it submitted.</p>`),
    text: `${subject}\n\n${kind}: ${text}\n\nOpen ${link} to mark it submitted.`,
  };
}
