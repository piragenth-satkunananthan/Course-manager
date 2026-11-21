# Stage 6: Comprehension Test

*   **Target:** `docs/designs/course-manager.md` (FeatureRange 1..768, DetailedRange 769..1426)
*   **Reviewer:** egm-comprehension (fresh context; no document standard)
*   **Context read:** CONTEXT.md, GLOSSARY.md, ADR-0001, ADR-0002
*   **Verdict:** No Blockers; 11 Major; 17 Nits. The reviewer could paraphrase every section. The Majors are places where the parts don't connect, or where two passages give different numbers or behaviour.

## What this proposes

The design is for a private, single-user web app for a Sri Lankan university student, built to stop missed Assignment deadlines. A long-running worker reads only the WhatsApp groups the student has linked, using Baileys (an unofficial client) on the student's personal number. It sends batches of those messages to an NVIDIA NIM model, validates the JSON operations that come back, and applies them directly as Auto Changes to Assignments, Exams, Session Changes and Semester end dates. No human reviews them first.

The safety net has five parts:
- every write is versioned;
- Undo works only while nothing else has touched the item;
- each field keeps the value from the most recently *sent* message;
- risky changes stay highlighted until opened, and a pause switch stops all Auto Changes;
- an external heartbeat sends an alert when the server, WhatsApp, AI or email fails.

Reminders go by email through Resend: a 07:00 Daily Digest of Deadlines due within 2 days, plus a Final Reminder 4 hours before each Deadline. M0 is a one-week throwaway spike that measures memory, disconnects and NIM accuracy (100% on deadline messages, at least 95% overall) and ends in a go/no-go report. M1 is the full release. M2 and M3 only get reserved columns.

## How the existing system works, per this document

Nothing is built yet. The repo holds only the product brief (CONTEXT.md), a glossary, and two ADRs. ADR-0001 fixes the stack: one Azure B1s VM with 1 GB of RAM running Docker Compose with Next.js, Postgres/Drizzle, Better Auth and Caddy, with images built in GitHub Actions. ADR-0002 accepts the ban risk of an unofficial WhatsApp client on the personal number. Some of the existing docs are out of date and this design lists edits to them (files 88–91):
- CONTEXT.md still promises an internal worker health check.
- CONTEXT.md still has Attendance under "Later phases".
- ADR-0002 still says the link "never sends anything".
- ADR-0001 has no priced resource list.

## Findings

### Major

| ID | Finding | Lines |
|---|---|---|
| C-M1 | **G2 promises two reminders for every Deadline, but the design does not deliver that.** An Exam with a date but no time gets no Final Reminder. A Deadline created after 07:00 and due the same day appears in no digest. Narrow G2, or state these exceptions there. | 29, 217, 398 |
| C-M2 | **The worker memory figure contradicts itself.** §1 caps the worker container at 256 MB, but M0's go criterion accepts up to 300 MB, so a worker that passes M0 could be killed in production. The per-container limits add up to 752 MB plus about 150 MB for the OS, more than the 750 MB budget. Say plainly that limits are caps, not the expected steady state. | 151–159, 591 |
| C-M3 | **How the web app asks the worker to act is never explained.** §8 never says how or how often the worker reads the `*_requested_at` columns. The stated intervals conflict: 60 s in one place; 2 s while pairing and 60 s otherwise in another. No loop polls for requests. `getLinkStatus` doesn't exist; the endpoint is `GET /api/v1/whatsapp`. Account deletion depends on this channel responding within 30 s. | 236, 384–385, 1071, 1079, 1158 |
| C-M4 | **The NIM retry schedule doesn't add up.** It lists four delays but marks messages dead "after the 6th failure", so the gap before the 6th attempt is never stated. Dead messages aren't pending, so the `ai` health rule (no pending message older than 30 min) would recover on its own. | 392, 480 |
| C-M5 | **Turning on the pause switch will look like an outage.** While paused, pending messages age past 30 minutes, `ai` goes unhealthy, the healthchecks.io pings stop, and the student gets a "down" email for a deliberate pause. | 195, 480, 486, 1195 |
| C-M6 | **What Undo does to `field_set_at`, and who the actor is, are both unspecified.** If Undo stamps `field_set_at` with the undo time, a reprocessed edit that keeps the original `sent_at` never applies. Undos triggered by an edit or a deleted message are recorded as `actor = student`. The `system` actor is never explained. | 223, 228, 230, 451–452, 945 |
| C-M7 | **Correcting a class change has no path, for the AI or for the student.** Only one Session Change is allowed per occurrence, and `ops.v1` has no update or reverse operation for one ("sorry, 4 not 3", "the cancelled class is back on"). The UI is told to edit the existing change, but §7 has no PATCH for session changes. | 205, 330–331, 424–426, 1038 |
| C-M8 | **How edits and deletions are stored and picked up is vague.** An edit row's `wa_message_id` is unstated: if it reuses the original id, the unique key silently drops it. What "marking" a revoke means, and how the batcher finds it, are both unstated. CUJ 4 depends on this path. | 239, 1188–1189 |
| C-M9 | **Highlighted changes can never be cleared through the API.** `markOpened` exists in the data layer, but §7 has no endpoint for it. | 224, 447, 1067, 1093–1107 |
| C-M10 | **Two Activity Log item types have no stated storage.** "Rejected AI output" isn't stored in any table (only in stdout logs), and "alerts" are only implied by `email_log`. | 337, 393, 506, 1063 |
| C-M11 | **CUJ 7 cannot be traced through the UI.** There is no screen or component for creating, setting current or archiving a Semester, and no named component for adding and removing Nicknames. | 95, 497–507, 1142–1150 |

### Nit

| ID | Finding | Lines |
|---|---|---|
| C-N1 | Some references can't be resolved by a newcomer: C5, F1, "Goldfish review", EGM, Context7, "approved ticket", and "the Student and Claude". `CLAUDE.md` is not in the context the reviewers were given. | 108, 569, 574, 583, 607, 757, 771, 1426 |
| C-N2 | Wrong cross-references: `wa_session` points to §8 for encryption, which is in §12; "§3 ownership table" refers to a table that doesn't exist (ownership is in the Rules column). | 236, 945 |
| C-N3 | The rate limit for password reset differs: 5 per 60 s in §5, 3 per 60 s in file 31. | 275, 983 |
| C-N4 | `entity_version` is "every write by anyone", but `setStatus` "bumps no version". It isn't said whether a status change gets a history row. | 223, 1042 |
| C-N5 | `.env.example` leaves out `BACKUP_AGE_RECIPIENT`, `BACKUP_SAS_URL`, `IMAGE_TAG`, `APP_HOST` and `DATABASE_URL_TEST`. | 858–866 |
| C-N6 | "Heartbeat" means two things. The deploy waits for a healthchecks.io ping, which never fires during a forced re-link, but file 78 waits for `health_signal(scheduler)`. | 561, 1311 |
| C-N7 | The backup is both part of the worker's all-healthy check and its own healthchecks.io check, so one failure produces two alerts. | 483, 487 |
| C-N8 | Settings lets the student change the time zone, but the AI context and prompt hard-code Asia/Colombo. | 344, 405, 1201 |
| C-N9 | The "4.30" rule's "afternoon deadline" is not defined. | 1202 |
| C-N10 | How a suppression expires is undefined. Undoing an AI-created Session Change or Semester extension has no suppression. | 215, 228 |
| C-N11 | What happens to `pending_ops` when a second "DSA" message arrives while the first Unknown Course mention is still open. | 226 |
| C-N12 | How the AI treats Session Group messages ("Group B lab cancelled") in M1, before Session Groups exist. | CONTEXT.md |
| C-N13 | The CUJs don't match the digest rule: CUJ 1 omits the "added" listing on 10 Nov, CUJ 2 doesn't update which digests list Lab 4, and line 398 implies a digest skipped at 07:00 is sent later that day. | 60, 66, 398 |
| C-N14 | The email provider is listed as open (line 49) but also as decided: Resend (line 776). | 49, 776 |
| C-N15 | `create-student` runs in the standalone web image, which may not have the script. "tsx or esbuild" calls tsx a bundler, but it's a runner. | 271, 1279–1280 |
| C-N16 | File 70 names `setup.test.ts`, but file 13 names `setup.ts`. | 880, 1243 |
| C-N17 | "Each Add from Possibly Missed becomes a test case" has no mechanism or file. | 454 |

**Reviewer's note:** the Majors most likely to cause real defects are C-M6 (Undo and `field_set_at`), C-M7 (no way to correct a Session Change) and C-M5 (pausing looks like an outage). The reviewer checked line references and the file counts (29 routes, 18 components, 10 schema files) by hand. No library behaviour was checked at this stage.
