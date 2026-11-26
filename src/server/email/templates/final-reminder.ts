import type { Deadline } from "@/shared/schemas/dashboard";
import { deadlineLine } from "./deadline-line";
import { esc, layout } from "./layout";

/** "4 hours", "1 hour", "1 day", "2 days": how far ahead the reminder was meant to go out. */
export const aheadText = (hours: number) => (hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.round(hours / 24)} day${Math.round(hours / 24) === 1 ? "" : "s"}`);

export function finalReminderEmail(d: Deadline, appOrigin: string, hours = 4, tf: "24h" | "12h" = "24h") {
  const { kind, text } = deadlineLine(d, tf);
  const link = `${appOrigin}/`;
  const subject = `Due in ${aheadText(hours)}: ${d.item.title} (${d.item.courseCode})`;
  return {
    subject,
    html: layout(subject, `<p style="margin:0 0 16px">${esc(kind)}: <strong>${esc(text)}</strong></p>
<p style="margin:0"><a href="${esc(link)}" style="color:#0f766e;font-weight:600">Open Course-manager</a> to mark it submitted.</p>`),
    text: `${subject}\n\n${kind}: ${text}\n\nOpen ${link} to mark it submitted.`,
  };
}
