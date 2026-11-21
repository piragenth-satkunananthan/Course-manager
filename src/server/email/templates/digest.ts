import type { Deadline } from "@/shared/schemas/dashboard";
import { deadlineLine } from "./deadline-line";
import { esc, layout } from "./layout";

/** Due soon (today and the next two days) and Added or moved since the last digest. "Check these" joins with #14. */
export function digestEmail(sections: { dueSoon: Deadline[]; addedOrMoved: Deadline[] }, dateLabel: string, appOrigin: string) {
  const subject = `Course-manager · ${dateLabel}: ${sections.dueSoon.length} due soon`;
  const list = (items: Deadline[]) => items.map((d) => deadlineLine(d)).map((l) => ({ ...l, url: `${appOrigin}/` }));
  const block = (title: string, items: Deadline[]) =>
    items.length
      ? `<h2 style="font-size:16px;margin:16px 0 8px">${esc(title)}</h2><ul style="margin:0;padding-left:20px">${list(items)
          .map((l) => `<li style="margin:0 0 6px"><a href="${esc(l.url)}" style="color:#0f172a">${esc(`${l.kind}: ${l.text}`)}</a></li>`)
          .join("")}</ul>`
      : "";
  const textBlock = (title: string, items: Deadline[]) => (items.length ? `${title}\n${list(items).map((l) => `- ${l.kind}: ${l.text}`).join("\n")}\n` : "");
  return {
    subject,
    html: layout(subject, block("Due soon", sections.dueSoon) + block("Added or moved", sections.addedOrMoved)),
    text: `${subject}\n\n${textBlock("Due soon", sections.dueSoon)}\n${textBlock("Added or moved", sections.addedOrMoved)}\nOpen ${appOrigin}/`,
  };
}
