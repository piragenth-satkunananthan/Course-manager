# Course-manager

* **Author:** piragenth-satkunananthan
* **Date:** 2026-11-20

## Overview

Course-manager is an invite-only web app for a university student in Sri Lanka. It holds Semesters, Courses, the timetable, Assignments, Exams, Attendance, and Notes with PDF Attachments in one place. A live WhatsApp Link on the student's personal number reads the Course Groups and the Class Group. NVIDIA NIM's hosted language model turns announcements into Auto Changes, which are applied without review and can be reversed from the Activity Log. Everything runs on one free Azure for Students B1s VM (1 GB RAM).

The pain the author wants removed is **missed Assignment deadlines**. Exams are not a pain point. Success means no missed Assignment deadlines in a semester, with dates, class times and files managed in one place.

Full requirements: `CONTEXT.md`. Vocabulary: `GLOSSARY.md`. Decisions: `docs/adr/`.

## Analysis

Seven Goldfish reviewers read the brief, the glossary and both ADRs, with no access to the ideation conversation. After merging duplicates there were 9 Blockers, 18 Majors and 9 Nits. All seven lenses raised the same three points.

### 1. One unanswered question decides the build order (Blocker)

We don't know whether past deadlines were missed because the announcement **never reached** the student (a capture problem) or because they **forgot** (a reminder problem).

- **If it was a capture problem,** M1 (manual entry) does nothing for the metric. M1 is large, so it pushes M2 into the middle of the semester being measured.
- **If it was a reminder problem,** M2 (WhatsApp + AI) does nothing for the metric. The only reminder path left is the Calendar Feed.

Either way, the current milestone order delivers the part that matters last. About 30 minutes spent going through last semester's missed deadlines would answer this.

The success metric also isn't written down and can't be measured. Overdue only counts Assignments the app knows about. A deadline the AI never captured, or moved later by mistake, never becomes Overdue, so the app can report "zero Overdue" while real deadlines were missed.

### 2. The Calendar Feed is probably not a working reminder (Blocker, unverified)

Example: at 21:00 someone posts "lab sheet due tomorrow 8am", and the Auto Change is applied correctly. But Google Calendar refreshes subscribed feeds roughly every 8–24 hours and probably ignores alarms in them, and Apple Calendar may strip the alerts. The system worked and the deadline was still missed.

The simplest fix the reviewers found is a **daily email digest** of Deadlines due in the next 48–72 hours, plus anything new or moved. The email provider is already needed for invites, so this is one scheduled job. It conflicts with the earlier "no reminders" decision, so it's the author's call.

### 3. Capture can fail without anyone noticing (several Blockers)

The likeliest way to lose a deadline is a capture failure that nobody sees:

- **No durable inbox.** Messages waiting in memory for the next batch are lost if the worker is killed (likely on 1 GB) or NIM fails, and Baileys won't deliver them again. A crash after applying a batch but before marking it done causes duplicate changes.
- **Throwing messages away hides omissions.** If the AI wrongly treats a deadline message as chatter, nothing is left behind, and Undo can't fix something that never happened. A question followed by "yes, 4.30" can't be resolved once the question has been discarded.
- **The 30-day catch-up conflicts with privacy.** WhatsApp sends history once, at pairing time, before the student has chosen any groups. Under ADR-0002 that history is dropped on arrival, so the catch-up processes nothing.
- **Health checks only notice a stopped process.** They miss a logged-out link, a socket that looks connected but receives nothing, NIM 401/429 errors, a retired model and failed backups. The checks run on the VM they're watching, so if the VM is shut down, no alert goes out.
- **Notifications on the phone (unverified).** Baileys' `markOnlineOnConnect` default may stop WhatsApp from showing notifications on the student's phone.

### 4. "Trust AI" with Undo has no defined data model (Blocker)

Automatic changes with Undo as the safety net stands as decided. The reviewers found its consequences undefined:

- Undo after a later correction.
- Late-arriving messages overwriting newer values.
- Whether marking Submitted counts as a manual edit. If it does, Undo is disabled on almost every Assignment.
- Undo of AI-created Courses that already contain items.
- A repeated wrong reading overwriting the student's own fix.

There's also no schema or validation for the model's output, so malformed or invented operations would be applied directly.

The proposed fix: keep a version row for every change, whether made by the AI or by hand. Undo is allowed only while the item's current version still equals that change's result. Track a last-set time per field, and split fields into AI-owned and Student-owned. Validate a typed operation schema in which targets are database ids, never free text. Record all of this in a new ADR-0003.

The costliest errors (a deadline moved later, an Assignment never created) need extra visibility on the dashboard. That doesn't require a review step.

### 5. Capacity and the free tier (Blockers)

- **NIM.** Estimated around 300k tokens a day per Student, multiplied by each invited friend. The free hosted API may be limited by credits or rate, or meant for prototyping only. No fallback provider or ADR exists.
- **Memory.** Estimated at 620–990 MB steady state against about 900 MB usable, with spikes from history sync and 20 MB uploads. Swapping on a burstable B1s uses up its CPU credits.
- **Invited friends** multiply memory use, cost and ban risk. They also connect from one shared Azure IP, so a ban could hit several numbers at once. Their consent and their groups' phrasing aren't covered by the test set.
- **Free allowance.** It ends after 12 months. The VM, database, files and backups all sit in one subscription and would go dark together.

### Contradictions the design accepts

| Improving… | …worsens | Proposed resolution |
|---|---|---|
| Automated capture | The metric, if misses came from forgetting | Settle the capture/reminder question; send reminders by email |
| Discarding messages (privacy) | Spotting omissions and context | Short encrypted rolling window, decision rows with no message text, "Possibly missed" flags |
| Dropping unlinked chats on arrival | The 30-day catch-up | Quarantine for a few minutes, fetch on demand, or drop the catch-up |
| "Latest message wins" | The student's own corrections | Version rows so Undo is never disabled; tombstones for undone creations |
| No review step | Visibility of the costliest errors | Highlight risky change types, not a review step |
| More Students | Memory, quota and correlated bans | Single-user v1 or a measured cap |
| Free hosting | A two-year life | A dated move-or-pay decision between semesters |

### Ideal Final Result

Every deadline announced in a linked group reaches the student in time, with no action from them and no new moving parts. Any message that looked like a deadline but produced no change is still visible somewhere. The system reuses what it already has: Postgres as both queue and short-term store, the email provider, the Calendar Feed, the Activity Log and the test set.

### Other gaps (Major and Nit)

- **Recurrence.** Occurrence identity isn't defined, it isn't said whether Break Weeks count as teaching weeks, and changing a session's weekday leaves its Attendance records pointing at nothing.
- **Semester rollover.** It isn't defined what happens to group links when a Semester or Course is archived.
- **Cardinality.** A Course with separate lecture and lab groups, or one group covering two Courses, can't be expressed.
- **Operations.**
  - Restoring a backup breaks WhatsApp sessions.
  - The app and worker images can be out of step with the database schema during a deploy.
  - Docker logs grow without limit and fill the disk.
  - Azure blocks port 25, so email has to go through an HTTPS API.
- **Docs.** Three decisions need ADRs: auto-apply, the NIM provider, and reminders. Attendance is listed under "Later phases" but also in M1. The setup wizard links WhatsApp groups in M1, but the link ships in M2. "Class", "group" and "link" are overloaded.

### Claims to verify before the spec is final

None of the reviewers had web access. These need checking:

- How often calendar apps refresh subscribed feeds and whether they keep alarms.
- NIM's free limits, its terms for production use, and how models get retired.
- Baileys:
  - How history sync behaves, and how reliable on-demand history fetch is.
  - Whether `markOnlineOnConnect` suppresses phone notifications.
  - The pairing-code API.
  - Memory used per socket.
- Azure for Students:
  - How much Blob storage is free, and whether the public IP is free.
  - Whether a B2ats or B2pts v2 VM is included.
- The Next.js Server Actions 1 MB body limit.

## Goals vs. Non-Goals

* **In-Scope Goals:**
  - No missed Assignment deadlines across a measured semester.
  - One place for dates, deadlines, class times, Attendance and files.
  - Automatic capture of announcements from linked WhatsApp groups, applied without review, with an Activity Log and Undo.
  - Invite-only use by the author and a few friends.
  - Hosting within Azure for Students free services.
* **Out-of-Scope Non-Goals:**
  - Sharing between Students and grades.
  - Push notifications.
  - Imports from the university's learning system or calendar files, and chat-export uploads.
  - Images and voice notes.
  - Tamil and Sinhala script.
  - Searching inside PDFs.
  - An installable PWA.
  - Joining and recording online classes (a later phase, with conditions).

## Alternatives Weighed

- **WhatsApp's official Business API**: Rejected because it can't read groups that a personal account belongs to.
- **Uploading WhatsApp chat exports by hand**: Rejected by author because the author wants capture with no manual steps.
- **A spare number for the WhatsApp Link**: Rejected by author, who accepted the ban risk on the personal number.
- **A suggestions inbox where the student approves each change**: Rejected by author ("trust AI"). Undo is the safety net.
- **Only Trusted Senders (Class Representative, lecturers) can change data**: Rejected by author. Every sender counts equally for now.
- **Open sign-up**: Rejected because every linked Student means a WhatsApp session held on the server. Changed to invite-only.
- **App Service + managed PostgreSQL + a separate worker VM**: Rejected because it's three services to set up, it still needs a VM, and App Service's free tier can't keep a process running.
- **whatsapp-web.js**: Rejected because its headless Chromium doesn't fit in 1 GB of RAM.
- **Installable PWA**: Rejected by author ("this is a webapp").
- **Ignoring messages about unknown Courses**: Rejected by author. The AI creates the Course, with "Not my course" and "Merge into…" to clean up.

Alternatives the reviewers raised that the author hasn't decided yet (carried into Key Decisions):

- A worker-only build that writes deadlines into the student's own Google Calendar or Tasks.
- A staged plan that starts with an M0 spike.
- SQLite instead of Postgres.
- A second free VM for the worker.
- Extracting facts once per message and applying them to each Student, instead of running the AI once per Student.

## Key Decisions & Staging for Next Steps

**Already decided (carried forward):** everything in `CONTEXT.md`, ADR-0001 and ADR-0002, the ban risk, and "trust AI".

**Waiting on the author before `/egm-draft` or `/to-spec`:**

1. ~~**Capture or reminder?**~~ **Resolved: a reminder problem.** The author saw the announcements and forgot them. So the WhatsApp Link + AI (M2) is a convenience. It doesn't move the metric, and the reminder does.
2. ~~**Push reminder.**~~ **Resolved: Gmail reminders.** A Daily Digest of Deadlines due in the next 2 days, plus a Final Reminder email 4 hours before each Deadline. The author still wants the WhatsApp Link from day one, so the first release includes both the reminders and the WhatsApp/AI part.
3. ~~**Single-user or friends**~~ **Resolved: single-user v1** (the author only). No invites. Records still carry the Student, so friends can be added later.
4. ~~**30-day catch-up**~~ **Resolved: dropped.** No look-back at older messages. The author types in the few open Deadlines once at setup, so the app never holds unlinked chats, not even briefly.
5. ~~**Manual edits**~~ **Resolved: a later message still overrides manual edits.** Version-row Undo (Analysis §4) is the protection.
6. ~~**Unknown Courses**~~ **Resolved: log them, don't create them.** The AI only attaches items to existing Courses. Unknown Courses are logged with "Add course", "Add as Nickname of…" and "Ignore". Dismissed Course and Merge are removed.
7. ~~**Add an M0 spike**~~ **Resolved: yes.** M0 is a week-long read-only WhatsApp test run plus the 50-message AI test, followed by a go/no-go note. The first release (M1) is cut down to what stops missed deadlines, and everything else moves to M2 (see `CONTEXT.md`).

**Engineering requirements to add to the spec, no decision needed:**

- A durable Postgres inbox.
- Text-free decision rows per message, and "Possibly missed" flags.
- Version-row Undo and a typed AI operation schema (ADR-0003).
- An external heartbeat and per-signal health alerts.
- `markOnlineOnConnect: false` and phone-number pairing codes.
- Browser-to-Blob uploads and a measured memory budget.
- A priced resource list and an Azure budget alert.
- Expand-then-contract migrations.
- An exact pass bar for the M2 test set (100% on deadline cases, at least 95% overall).
- Glossary entries for Occurrence, Teaching Week, Archived and Missed Deadline.
- ADRs for the NIM provider and reminders.
