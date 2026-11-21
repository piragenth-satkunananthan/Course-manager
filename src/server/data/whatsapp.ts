// The WhatsApp Link from the web app's side (design file 47): reads the status and groups, and writes requests
// that the worker's poller acts on within 2 seconds (§8). The web app never talks to WhatsApp itself.
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { course, semester, waGroup, waSession } from "@/server/db/schema";
import { invalid, notFound } from "@/server/http/errors";
import type { GroupLink, WaGroup, WhatsAppStatus } from "@/shared/schemas/whatsapp";
import { iso } from "./util";

const ensureSession = (studentId: string) => db.insert(waSession).values({ studentId }).onConflictDoNothing();
const toGroup = (g: typeof waGroup.$inferSelect): WaGroup => ({ id: g.id, subject: g.subject, linkedCourseId: g.linkedCourseId, linkedSemesterId: g.linkedSemesterId });

export async function getWhatsApp(studentId: string): Promise<WhatsAppStatus> {
  await ensureSession(studentId);
  const [[s], groups] = await Promise.all([
    db.select().from(waSession).where(eq(waSession.studentId, studentId)),
    db.select().from(waGroup).where(eq(waGroup.studentId, studentId)).orderBy(asc(waGroup.subject)),
  ]);
  return { status: s!.status, pairingCode: s!.pairingCode, lastError: s!.lastError, lastEventAt: iso(s!.lastEventAt), groups: groups.map(toGroup) };
}

export async function requestPairing(studentId: string, phone: string) {
  await ensureSession(studentId);
  await db
    .update(waSession)
    .set({ status: "pairing", pairingPhone: phone, pairingRequestedAt: new Date(), pairingCode: null, lastError: null })
    .where(eq(waSession.studentId, studentId));
  return getWhatsApp(studentId);
}

/** Logs out and wipes the session, through the worker. Also used by account deletion (#17). */
export async function requestUnlink(studentId: string) {
  await ensureSession(studentId);
  await db.update(waSession).set({ unlinkRequestedAt: new Date() }).where(eq(waSession.studentId, studentId));
  return null;
}

export async function linkGroup(studentId: string, groupId: string, link: GroupLink | null) {
  const [g] = await db.select({ id: waGroup.id }).from(waGroup).where(and(eq(waGroup.studentId, studentId), eq(waGroup.id, groupId)));
  if (!g) throw notFound("Group");
  if (link && "courseId" in link) {
    const [c] = await db.select({ archivedAt: course.archivedAt }).from(course).where(and(eq(course.studentId, studentId), eq(course.id, link.courseId)));
    if (!c) throw notFound("Course");
    if (c.archivedAt) throw invalid("courseId", "Archived Courses can't have a linked group");
  }
  if (link && "semesterId" in link) {
    const [s] = await db.select({ archivedAt: semester.archivedAt }).from(semester).where(and(eq(semester.studentId, studentId), eq(semester.id, link.semesterId)));
    if (!s) throw notFound("Semester");
    if (s.archivedAt) throw invalid("semesterId", "Archived Semesters can't have a linked group");
  }
  const [row] = await db
    .update(waGroup)
    .set({
      linkedCourseId: link && "courseId" in link ? link.courseId : null,
      linkedSemesterId: link && "semesterId" in link ? link.semesterId : null,
      linkedAt: link ? new Date() : null,
    })
    .where(and(eq(waGroup.studentId, studentId), eq(waGroup.id, groupId)))
    .returning();
  await ensureSession(studentId);
  await db.update(waSession).set({ groupsReloadRequestedAt: new Date() }).where(eq(waSession.studentId, studentId));
  return link ? toGroup(row!) : null;
}
