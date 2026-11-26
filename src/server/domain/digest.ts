// The Daily Digest (design file 26): Due soon, Added or moved, and Check these (#14).
import { DEFAULT_NOTIFY, isDigestDue } from "./reminders";
import { addDays } from "./time";

/** Two hours from the chosen digest time (07:00–08:59 by default), Asia/Colombo; never when the digest is off. */
export const isDigestWindow = isDigestDue;

export type CheckTheseInput = {
  riskyChanges: { summary: string; risk: "normal" | "moved_later" | "cancelled" }[];
  possiblyMissed: { senderName: string | null; groupSubject: string; text: string | null }[];
  unknownCourses: { name: string }[];
  paused: boolean;
};

const clip = (t: string) => (t.length > 120 ? `${t.slice(0, 119)}…` : t);

/** One line per thing to check, in the digest's order. */
function checkThese(c: CheckTheseInput) {
  return [
    ...c.riskyChanges.map((r) => `${r.risk === "cancelled" ? "Cancelled" : "Moved later"}: ${r.summary}`),
    ...c.possiblyMissed.map((m) => `Possibly missed, ${m.senderName ?? "a message"} in ${m.groupSubject}${m.text ? `: "${clip(m.text)}"` : ""}`),
    ...c.unknownCourses.map((u) => `Unknown Course "${u.name}": add it, link it to a Course, or ignore it`),
    ...(c.paused ? ["Auto Changes are paused: new announcements aren't applied"] : []),
  ];
}

/** Due soon is today and the chosen days after it (2 by default); Added or moved is what changed since the last digest. Null when there's nothing to say. */
export function selectDigest<T extends { id: string; localDate: string | null }>(open: T[], changedIds: ReadonlySet<string>, today: string, check: CheckTheseInput, days = DEFAULT_NOTIFY.digestDays) {
  const last = addDays(today, days);
  const dueSoon = open.filter((d) => d.localDate !== null && d.localDate >= today && d.localDate <= last);
  const addedOrMoved = open.filter((d) => changedIds.has(d.id));
  const lines = checkThese(check);
  return dueSoon.length || addedOrMoved.length || lines.length ? { dueSoon, addedOrMoved, checkThese: lines } : null;
}
