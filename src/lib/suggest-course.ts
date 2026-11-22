// Settings → WhatsApp (U13): a group named after a Course code ("SWT22022/(22/23)") suggests that Course.

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The one Course whose whole code appears in the group's name, or undefined when none or several do. */
export function suggestCourse<C extends { code: string }>(subject: string, courses: C[]): C | undefined {
  const hits = courses.filter((c) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(c.code)}($|[^a-z0-9])`, "i").test(subject));
  return hits.length === 1 ? hits[0] : undefined;
}
