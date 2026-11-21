# Goldfish Review Report: Stage 5 (Initial Zoom Out)

**Target:** `/home/piragenth/Documents/Course-manager/docs/designs/course-manager.md` (lines 1-1426)
**Mode:** REVIEW
**Baseline context:** `CONTEXT.md`, `GLOSSARY.md`, `docs/adr/0001-single-vm-nextjs-stack.md`, `docs/adr/0002-whatsapp-link-unofficial-client-personal-number.md`

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed (1 Blocker, 5 Major, 6 Nit) |
| `egm-inventive-catalyst` | completed (7 Major, 5 Nit; this persona grades only Major or Nit in REVIEW mode) |

## Summary

- After deduplication: **1 Blocker, 11 Major, 10 Nit** (22 findings).
- Merged findings:
  - ZO-1 with IC-6 (edit handling).
  - ZO-4 with IC-1 (scheduler isolation).
  - ZO-8 with IC-5 (10-operation cap). This one is graded Major, the higher of the two grades.
- The Blocker was checked against the target. Line 228 says undoing a create adds a `suppression`. Line 215 says a suppression expires only when the due date changes. Line 445 skips any create that matches a suppression. Line 451 undoes the original change before reprocessing an edit.
- The reviewers did not verify these third-party behaviours. They need confirming before anyone acts on the findings that depend on them:
  - the Resend idempotency key and the test-sender limits;
  - the healthchecks.io ping body and the free-tier check limit;
  - the Baileys edit timestamp and the event type used for messages delivered after an offline period.

---

## Blocker

### B1. Correcting a deadline message (edit, or delete and repost) can remove the Assignment without notice
- **Lens:** `egm-zoom-out`, `egm-inventive-catalyst`
- **Location:**
  - §3 "The Undo rule" (L228)
  - §3 "most recently sent wins" (L230)
  - `suppression` table (L215)
  - §9 validation rule 6 (L445)
  - §9 "Edited and deleted messages" (L449-452)
  - File 64 `edits.ts` (L1209)
  - `undoPlan` (L948)
- **Failure scenario:**
  - **Edit:**
    1. A classmate posts "Lab 4 due Friday" and the AI creates the Assignment.
    2. They edit the message to fix a typo.
    3. Following L451, the worker undoes the original create. Following L228, that soft-deletes the Assignment and adds a `suppression` for (title, due date).
    4. The edited text is reprocessed and produces the same create, which rule 6 skips as suppressed.
    5. The Assignment is gone, and so are its digest entry and its Final Reminder. The only trace is a "skipped" log line.
  - **Delete and repost:** this is the usual way to fix a WhatsApp message. The revoke undoes the create and adds a suppression, so the repost with the same title and date is blocked.
  - **Edit after a later write:**
    1. 10:00: a message says "due Friday".
    2. 11:00: a repeat announcement bumps `version` and `field_set_at`.
    3. 12:00: the 10:00 message is edited to "due Thursday".
    4. The Undo rule is now blocked, because the version has moved.
    5. The edit is processed with `sent_at = 10:00`, which is older than `field_set_at`, so the correction is dropped. Corrections usually move a date earlier, which is the dangerous direction.
  - **Undo timestamps:** a system undo writes `actor = student` at the current time. Unless `field_set_at` is restored, any reprocessed update that carries the original `sent_at` loses.
- **Suggested fix:**
  - Do not undo and reprocess on edit. Send the edited text into the next batch as a message flagged `edited`, and let the AI emit `update_*` or `cancel_*` against the existing id. This is the same path CUJ 2 uses for corrections.
  - Use the edit event's own timestamp as the effective `sent_at` for precedence. Keep the original `sent_at` only for resolving relative dates such as "tomorrow".
  - Create a `suppression` only on an explicit Student undo or delete, never on a system-initiated undo such as a revoke.
  - Record the decision in an ADR.
  - Add three cases to the AI eval and the integration tests: a typo-fix edit, a delete and repost, and an edit after a later write.

---

## Major

### M1. The reminder scheduler stops when NIM is unavailable and is the first process killed under memory pressure
- **Lens:** `egm-zoom-out`, `egm-inventive-catalyst`
- **Location:**
  - §1 components (L146)
  - Memory budget (L151, L157)
  - §10 worker startup checks (L468)
  - File 58 `src/worker/main.ts` (L1157)
  - Compose `oom_score_adj` (L1287)
- **Failure scenario:**
  - **NIM outage:** NIM's `/v1/models` is down or rate-limited, or the pinned model is retired (an open question at L48). The worker exits at startup, and `unless-stopped` restarts it into the same failure. No digest or Final Reminder is sent, although the reminder path never calls NIM.
  - **Memory pressure:** the OOM killer is set to kill `worker` first (+500). That kills the reminder loop together with Baileys, whose memory use has not been measured. Meanwhile `web`, the container that matters least for G1, is protected more.
- **Suggested fix:**
  - Make each startup check gate only its own loop. A failed NIM check marks `health_signal(ai)` unhealthy and keeps retrying, while the scheduler and WhatsApp loops start normally.
  - Start the scheduler loop first and keep it independent of the other loops.
  - Reverse the OOM priority so `web` is killed first.
  - If M0 measurements show Baileys memory spikes, run the scheduler as a separate Compose service from the same image (about 60-80 MB).

### M2. The safety nets for AI mistakes are only in the web app, but the student reads email
- **Lens:** `egm-inventive-catalyst`
- **Location:**
  - The Problem (L24)
  - Non-Goals (L38)
  - CUJ 5 (L80-84)
  - §8 Daily Digest (L398)
  - §9 risky-change highlighting (L447)
  - §9 Possibly Missed (L454)
  - File 26 `digest.ts` (L956)
  - File 36 digest template (L1006)
  - Alternative D (L627-631)
- **Failure scenario:** The student's problem is forgetting, and Gmail is what they check. These outcomes never reach email:
  - A wrong AI cancellation. The item drops out of the digest and its Final Reminder is cancelled.
  - A wrong "moved later" change. The real, earlier date passes without a reminder.
  - Possibly Missed messages, which appear only in the Activity Log.
  - An unknown-Course quiz held in `pending_ops`.

  "Highlighted until opened" helps only once the dashboard is opened.
- **Suggested fix:**
  - Add three sections to the existing Daily Digest: "Cancelled or moved later since last digest", "Possibly missed" (capped at 5 plus "N more"), and "Unknown Courses waiting". Each item links to its Activity Log entry.
  - Count these sections as content when deciding whether to skip a digest.

### M3. A single combined heartbeat lets one known failure hide every later one
- **Lens:** `egm-inventive-catalyst`
- **Location:**
  - G4 (L31)
  - §10 Health signals and External heartbeat (L475-489)
  - File 65 `health.ts` (L1217)
- **Failure scenario:**
  - The ping is sent only when all signals are healthy. Once one signal stays bad, healthchecks.io stays "down" and sends no further alerts. Examples are WhatsApp logged out for days, or the pause switch on.
  - While that lasts, a scheduler crash, email failure or VM outage raises no alert.
  - `auto_changes_paused` also turns `ai` unhealthy after 30 minutes, which produces a false "server down" alert for a deliberate action.
- **Suggested fix:**
  - Use two checks. A reminder-path check covers scheduler, email and VM liveness. A capture-path check covers `wa_socket` and `ai`.
  - Treat a paused state as healthy for `ai`, the same way "deliberately unlinked" is healthy for `wa_socket`.
  - Optionally send the failing signal names in the ping body.
  - Confirm the healthchecks.io free-tier check limit (assumed at L488).

### M4. Messages marked `dead` after a NIM outage have no way back
- **Lens:** `egm-inventive-catalyst`
- **Location:**
  - §8 Failure retries (L392)
  - §10 `ai` signal (L480)
  - Direct alerts (L489)
  - File 64 `nim-client.ts` (L1206)
- **Failure scenario:** A NIM quota exhaustion (429) or an outage of about 80 minutes or more marks every message in that window `dead`, including deadline announcements. The student is told "3 messages could not be processed" and has to type the Deadlines in by hand.
- **Suggested fix:**
  - The message text is kept (D1), so dead messages can be retried. After the next successful NIM call, requeue them as `pending` with `attempts = 0`, up to a fixed number of re-drives per message.
  - Add a "Retry" action on the Activity Log entry.
  - Relative dates must resolve against `sent_at`. The prompt already requires this (L1201).

### M5. The 10-operation cap discards whole legitimate batches
- **Lens:** `egm-inventive-catalyst` (Major), `egm-zoom-out` (Nit)
- **Location:**
  - §9 validation rule 5 (L444)
  - Prompt injection (L456)
  - File 64 `validate.ts` (L1207)
  - Batcher pause behaviour (L1195)
- **Failure scenario:** A Class Representative posts a month's schedule with 11 or more items. Two other cases behave the same way: a busy start-of-semester batch, and the backlog applied when `auto_changes_paused` is turned off. In each case the whole batch is rejected, so none of those Deadlines get reminders unless the student enters them by hand.
- **Suggested fix:**
  - Apply the cap only to destructive operations (cancel, moved later, semester changes) or count it per source message. Creates are low-harm and batch Undo already covers them.
  - Park any over-cap remainder in the existing `pending_ops` mechanism, with one "Apply these N changes" action. Show that action in the digest (see M2).

### M6. A crash between applying operations and marking messages done is not idempotent
- **Lens:** `egm-inventive-catalyst`
- **Location:**
  - §2 data flow (L177-182)
  - §10 Idempotency (L471)
  - §13 Integration (L543)
  - File 64 `apply.ts` (L1208)
  - File 70 inbox test (L1250)
- **Failure scenario:**
  - §10 says each operation and its message status update share one transaction. §2 and `apply.ts` instead apply each operation in its own transaction and mark the messages done afterwards.
  - After a crash between those steps, the messages are still pending. The replay calls NIM again and relies on the model choosing to reuse existing ids.
  - Nothing guarantees the "no duplicate" result the test promises, and the second output can differ from the first.
- **Suggested fix:**
  - Store the validated operations in `ai_batch.output jsonb` before applying any of them.
  - Add a unique index on `auto_change(batch_id, op_index)`.
  - On replay, re-apply the stored operations, skip indexes that already exist, mark the messages done, and do not call NIM again.

### M7. Account deletion waits 30 seconds for an unlink the worker may not see for 60 seconds
- **Lens:** `egm-inventive-catalyst`
- **Location:**
  - §8 (L384)
  - File 47 (L1071)
  - File 48 step 2 (L1079)
  - §12 Account deletion (L529-533)
- **Failure scenario:**
  - Outside pairing, the worker checks `unlink_requested_at` every 60 seconds (L1071). Deletion waits 30 seconds and then proceeds either way (L1079).
  - In about half of deletions, the user row, `wa_session` and the keys are deleted while the socket is still connected. The linked device stays on the phone, and Baileys key writes fail on foreign keys.
  - CONTEXT.md's requirement that "Delete my account unlinks WhatsApp" is not met.
- **Suggested fix:**
  - Poll the single `wa_session` row every 2 seconds at all times.
  - Do not cascade-delete until the worker confirms logout, or make the timeout longer than the poll interval.
  - `LISTEN/NOTIFY` is an alternative, but needs a dedicated connection.

### M8. M1 includes much more than the deadline problem needs
- **Lens:** `egm-zoom-out`
- **Location:**
  - Overview (L13)
  - G6 (L33)
  - CUJ 8 (L98-102)
  - §3 timetable tables (L199-207)
  - §9 occurrence operations (L424-427)
  - Build order (L781-794)
- **Failure scenario:**
  - M1 also includes:
    - occurrence expansion and Session Changes (three AI operations);
    - Semester extension;
    - Exams with TBA handling (CONTEXT L11: "Exams are not a pain point");
    - batch undo;
    - risk highlighting;
    - a conflict dialog.
  - Each week spent on these is a week without deadline reminders.
  - The AI prompt and eval must also cover timetable meaning before capture can go live, which widens what the 100% eval gate has to cover.
- **Suggested fix:**
  - Split the milestone in two.
    - **M1a:** Assignments, AI create/update/cancel for Assignments, the Activity Log with Undo, the digest and Final Reminder, the heartbeat, deploy and backup.
    - **M1b:** the timetable, Session Changes, Exams and extensions.
  - This changes the CONTEXT.md milestone list, so the author must agree to it.

### M9. The `reminder` table is a derived copy that every write path must keep in sync
- **Lens:** `egm-zoom-out`
- **Location:**
  - `reminder` table (L246)
  - `writeEntity` step 6 (L1022)
  - `setStatus` (L1042)
  - `reminders.ts` `shouldCancel` (L952)
  - Course hard delete (L267)
  - `pending_ops` replay (L1066)
- **Failure scenario:** Any path that changes a due date, status or deletion without going through `writeEntity` or `setStatus` leaves a stale reminder row. Examples are the course hard-delete cascade, a Semester archive, or a later script. The result is a Final Reminder at the old time, or one for a deleted item.
- **Suggested fix:**
  - Drop the table. On each 60-second tick, query open Deadlines whose due time minus 4 hours has passed and that have no `email_log` row.
  - Give `email_log` a unique index on `(entity_type, entity_id, due_at)`.
  - Moving with the Deadline and stopping when Submitted then follow from the query.

### M10. The REST layer duplicates reads that the pages already do directly
- **Lens:** `egm-zoom-out`
- **Location:**
  - §7 (L289-349)
  - D3 (L603)
  - Alternative L (L675-679)
  - File 51 (L1093)
- **Failure scenario:**
  - Pages read through `src/server/data/` (L289, L494). The following GETs are therefore used only by a hypothetical "script or future app", which CONTEXT L103 puts out of scope: `GET /dashboard`, `/semesters`, `/courses`, `/courses/:id`, `/assignments`, `/exams` and `/settings`.
  - Each GET is a second code path to scope, test in the two-Student suite, and type.
- **Suggested fix:**
  - Keep REST for writes, as D3 decided.
  - Keep only the GETs the client polls or pages through: WhatsApp status, the Activity cursor, and timetable week navigation.
  - Drop the "future app" and `/api/v1` versioning rationale (L349).

### M11. Nothing checks that reminder emails reach the inbox
- **Lens:** `egm-zoom-out`
- **Location:**
  - G2 (L29)
  - Fixed choices: Resend test sender (L776)
  - Verification (L1421)
- **Failure scenario:**
  - Digests come from Resend's shared test sender with no verified domain.
  - Gmail starts filing them under Spam or Promotions.
  - `email_log` still says "sent" and all signals are green, so the original failure returns without an alert.
  - G2 measures send, not delivery.
- **Suggested fix:**
  - Add a Gmail filter step to `provision-vm.md`, set to "Never send to Spam" and "Categorise as Primary".
  - Optionally put the date and the open-Deadline count in the subject line, so a missing digest is noticeable.
  - State in G2 that it measures send, not inbox placement.

---

## Nit

### N1. M2 hook columns are added before any code reads them
- **Lens:** `egm-zoom-out`
- **Location:** `class_session` (L204), L250, `occurrences.ts` (L931-932)
- **Failure scenario:** Speculative columns (`repeat_every_weeks`, `starts_week`, `session_group_id`) and the off-day hook add schema and code that M1 never uses.
- **Suggested fix:** Add them in M2 with an expand migration (L562). Keep `student_id`, which CONTEXT requires.

### N2. `field_set_at` jsonb, `version` and `entity_version` are three overlapping precedence and history mechanisms
- **Lens:** `egm-zoom-out`
- **Location:** §3 (L193, L223, L228-230), `versioning.ts` (L942-948)
- **Failure scenario:** Per-field timestamps make the undo and edit interactions hard to reason about, and this contributes to B1.
- **Suggested fix:** Consider a per-row `last_source_sent_at`. If per-field timestamps stay, specify exactly how undo restores them.

### N3. The conflict dialog ("keep theirs / re-apply mine") is too much for one user
- **Lens:** `egm-zoom-out`
- **Location:** File 57 `conflict-dialog` (L1150), §7 `CONFLICT` (L307)
- **Failure scenario:** It adds UI and test surface for a case that rarely happens.
- **Suggested fix:** Keep `expectedVersion`. On `CONFLICT`, show "This item was just changed by a WhatsApp message; reloaded" and reload the item.

### N4. The implementation plan goes down to function signatures and byte layouts
- **Lens:** `egm-zoom-out`
- **Location:** Files 20-27, 37 and 64 (for example L920, L926, L945-948, L1016-1022)
- **Failure scenario:** These details fix choices that are better made while coding.
- **Suggested fix:** Keep the responsibilities and invariants, and mark the signatures as indicative.

### N5. Some references cannot be resolved by a new reader
- **Lens:** `egm-zoom-out`
- **Location:** "C5" (L108), "reviewer finding F1" (L569), "Goldfish review" (L607)
- **Failure scenario:** A reader without the review history cannot follow these.
- **Suggested fix:** Write out each point in one line, or link to its exact location in `concepts_brief.md`.

### N6. The retry schedule and "the 6th failure" do not match
- **Lens:** `egm-inventive-catalyst`
- **Location:** §8 (L392)
- **Failure scenario:** Four retry delays give five attempts, so "after the 6th failure" is undefined.
- **Suggested fix:** State the attempt count explicitly.

### N7. Sending an email and logging it are separate steps
- **Lens:** `egm-inventive-catalyst`
- **Location:** L1215-1216, `email_log` unique index (L247)
- **Failure scenario:** If the email is sent first and then logged, a crash duplicates it. If it is logged first and then sent, a crash loses it.
- **Suggested fix:** Pass a Resend idempotency key such as `digest-<date>` or `reminder-<id>-<send_at>`. First confirm that Resend supports this and check its window (about 24 hours).

### N8. A Semester extension and a new due date in the same batch can be rejected together
- **Lens:** `egm-inventive-catalyst`
- **Location:** §9 validation (L440)
- **Failure scenario:** "Semester extended; final project due <new date>" is rejected, because the date is checked against the old end date.
- **Suggested fix:** Validate dates against the end date after applying any `extend_semester` in the same batch.

### N9. Messages that arrive during a worker restart may be dropped
- **Lens:** `egm-inventive-catalyst`
- **Location:** L151 ("restart loses nothing"), L1184 (`notify` only)
- **Failure scenario:** If Baileys delivers queued offline messages under a type other than `notify`, every deploy or OOM kill drops messages without notice.
- **Suggested fix:** Add an M0 check that messages posted during a planned worker stop are ingested, and widen the type filter if they are not.

### N10. When the server is down, the student has no record of what is due
- **Lens:** `egm-inventive-catalyst`
- **Location:** §8 Daily Digest (L398), G4
- **Failure scenario:** During a VM outage no Final Reminders go out, and the heartbeat alert does not list what is due.
- **Suggested fix:** Add a short "next 14 days" footer to each digest, so the last digest in Gmail still holds the schedule.
