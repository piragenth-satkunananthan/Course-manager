import { formatDate } from "@/lib/format";
import type { Deadline } from "@/shared/schemas/dashboard";
import { deadlineLine } from "./deadline-line";

const dateOf = (d: Deadline) => (d.type === "assignment" ? d.item.dueDate : d.item.date!);
import { esc, layout } from "./layout";

/**
 * Due soon (today and the next two days), grouped by day, Added or moved since the last digest, and Check these (#14).
 * Deadlines link to the dashboard until the Deadline list pages exist (M1b); Check these links to the Activity Log.
 */
export function digestEmail(sections: { dueSoon: Deadline[]; addedOrMoved: Deadline[]; checkThese: string[] }, dateLabel: string, appOrigin: string) {
  const subject = `Course-manager · ${dateLabel}: ${sections.dueSoon.length} due soon`;
  const link = `${appOrigin}/`;
  const html = (title: string, groups: [string | null, Deadline[]][]) =>
    groups.length
      ? `<h2 style="font-size:16px;margin:16px 0 8px">${esc(title)}</h2>` +
        groups
          .map(([day, items]) =>
            (day ? `<p style="margin:8px 0 4px;font-weight:600;color:#475569">${esc(day)}</p>` : "") +
            `<ul style="margin:0;padding-left:20px">${items.map((d) => deadlineLine(d)).map((l) => `<li style="margin:0 0 6px"><a href="${esc(link)}" style="color:#0f172a">${esc(`${l.kind}: ${l.text}`)}</a></li>`).join("")}</ul>`,
          )
          .join("")
      : "";
  const text = (title: string, groups: [string | null, Deadline[]][]) =>
    groups.length ? `${title}\n${groups.map(([day, items]) => (day ? `${day}\n` : "") + items.map((d) => deadlineLine(d)).map((l) => `- ${l.kind}: ${l.text}`).join("\n")).join("\n")}\n` : "";
  const byDay = [...Map.groupBy(sections.dueSoon, dateOf)].map(([date, items]): [string, Deadline[]] => [formatDate(date), items]);
  const moved: [string | null, Deadline[]][] = sections.addedOrMoved.length ? [[null, sections.addedOrMoved]] : [];
  const activity = `${appOrigin}/activity`;
  const check = sections.checkThese;
  const checkHtml = check.length
    ? `<h2 style="font-size:16px;margin:16px 0 8px">Check these</h2><ul style="margin:0;padding-left:20px">${check.map((l) => `<li style="margin:0 0 6px"><a href="${esc(activity)}" style="color:#0f172a">${esc(l)}</a></li>`).join("")}</ul>`
    : "";
  const checkText = check.length ? `Check these (${activity})\n${check.map((l) => `- ${l}`).join("\n")}\n` : "";
  return {
    subject,
    html: layout(subject, html("Due soon", byDay) + html("Added or moved", moved) + checkHtml),
    text: `${subject}\n\n${text("Due soon", byDay)}\n${text("Added or moved", moved)}\n${checkText}\nOpen ${link}`,
  };
}
