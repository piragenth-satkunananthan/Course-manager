// Makes a real Auto Change for end-to-end tests: a message in a linked group, processed by the real AI batch with a
// fake AI that creates one Assignment. Usage: tsx e2e/support/seed-auto-change.ts <email> <courseId> <title> <dueDate> [mode]
// Mode "missed": the AI calls the message possibly missed (no Practical Course). Mode "unknown": `title` is an
// Unknown Course, with one proposed Assignment (#14).
import { eq } from "drizzle-orm";
import { loadKey } from "@/server/crypto";
import { db, pool } from "@/server/db/client";
import { course, semester, user, waGroup } from "@/server/db/schema";
import { aiTick } from "../../src/worker/ai/batcher";
import { Ingest } from "../../src/worker/whatsapp/ingest";

const [email, courseId, title, dueDate, mode = "create"] = process.argv.slice(2) as [string, string, string, string, string?];
const key = loadKey();
const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
// The AI only sees the current Semester's Courses, so make this Course's Semester current.
const [c] = await db.select({ semesterId: course.semesterId }).from(course).where(eq(course.id, courseId));
await db.update(semester).set({ isCurrent: false }).where(eq(semester.studentId, u!.id));
await db.update(semester).set({ isCurrent: true }).where(eq(semester.id, c!.semesterId));
const jid = `${courseId}@g.us`;
await db.insert(waGroup).values({ studentId: u!.id, waJid: jid, subject: "Course group", linkedCourseId: courseId }).onConflictDoNothing();
const ingest = new Ingest(u!.id, key);
await ingest.reloadGroups();
await ingest.handle("messages.upsert", {
  type: "notify",
  messages: [{ key: { remoteJid: jid, id: `${title}-${Date.now()}`, fromMe: false }, messageTimestamp: Math.floor(Date.now() / 1000) + 2, pushName: "Kasun", message: { conversation: `${title} due ${dueDate}` } }],
});
await aiTick(
  {
    model: "fake/e2e",
    complete: async (chat) => {
      const ctx = JSON.parse(chat[1]!.content) as { messages: { id: string }[] };
      const ids = ctx.messages.map((m) => m.id);
      const assignment = { op: "create_assignment", courseId, title, dueDate, sourceMessageIds: ids };
      const reply =
        mode === "missed"
          ? { messages: ids.map((id) => ({ id, decision: "possibly_missed", reason: "This Course has no Practical Course" })), operations: [], unknownCourses: [] }
          : mode === "unknown"
            ? { messages: ids.map((id) => ({ id, decision: "unknown_course", reason: "e2e" })), operations: [], unknownCourses: [{ name: title, messageIds: ids, proposedOperations: [{ ...assignment, courseId: null, title: `${title} essay` }] }] }
            : { messages: ids.map((id) => ({ id, decision: "applied", reason: "e2e" })), operations: [assignment], unknownCourses: [] };
      return { content: JSON.stringify(reply), inputTokens: 1, outputTokens: 1 };
    },
  },
  key,
  new Date(Date.now() + 3 * 60_000),
);
await pool.end();
