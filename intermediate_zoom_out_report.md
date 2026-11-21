# Goldfish Review Report: Stage 8 (Intermediate Zoom Out)

**Target:** `/home/piragenth/Documents/Course-manager/docs/designs/course-manager.md` (lines 1-1426, not edited since Stage 5)
**Standard:** `zoom-out-standard.md`
**Inputs reviewed:** Stage 5 `zoom_out_report.md`, Stage 6 `comprehension_report.md`, Stage 7 `critic_report.md`, plus CONTEXT.md, GLOSSARY.md, ADR-0001 and ADR-0002.

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-zoom-out` | completed |

**Severity breakdown:** 0 Blocker, 10 Major, 7 Nit.

**Verdict:** Most fixes from earlier stages are cheap and worth doing. About a dozen would add endpoints, columns, alert channels or containers. None of those makes it less likely that the Student misses an Assignment deadline, compared with the cheaper fixes below. The main pattern: four separate fixes each build their own way to "apply AI output later". The kept message text (D1) already lets the app re-run messages from the inbox, so none of the four is needed.

The repo has no application code yet, so there is nothing to reuse. All reuse advice points at parts the design already has.

---

## Prioritized Findings (Blockers -> Major -> Nits)

### IZ-1. Taking every earlier fix as written would grow M1 a lot - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** All three prior reports.
* **Scenario:** If every suggested fix goes in as written, M1 gains all of these:
  * one healthchecks.io check per signal, plus a staleness rule (MAJ-16);
  * Resend webhooks (MAJ-21);
  * stored AI output and replay (M6);
  * "Apply anyway" and parked operations (MAJ-14, M5);
  * a retry-dead endpoint and button (M4, MAJ-12);
  * a `markOpened` endpoint (C-M9);
  * a Session Change PATCH and a new AI operation (C-M7);
  * an immediate email on every cancellation (MAJ-15);
  * a second backup provider (MAJ-20);
  * a scored risk register (MAJ-01);
  * a separate scheduler container (M1).

  None of these makes G1 safer than the cheap fixes in IZ-2 to IZ-16. Several also add more write paths that must keep the `reminder` table in step, which makes Stage 5 M9 worse.
* **Suggested fix:** Apply the merges and rejections in this report. For each rejected fix, add one line to the doc ("considered, not done because...") so later reviewers do not raise it again.

### IZ-2. Edit and delete handling: four overlapping fixes, merge into one - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §9 "Edited and deleted messages" (L449-452), file 64 `edits.ts` (L1209); Stage 5 B1, Stage 7 BLK-01, Stage 6 C-M6 and C-M8.
* **Scenario:** B1 and BLK-01 both say "treat an edit as a new message". Each also adds its own extras (Undo restores `field_set_at`, a new ADR, eval cases). If both are applied, the implementer keeps the old undo-and-reprocess path and also builds the new one.
* **Suggested fix:** Make one change:
  * Delete undo-and-reprocess for edits. An edit becomes a new inbox row, keyed by the original id plus the edit timestamp. That key also fixes C-M8. The row is flagged "edit of <id>".
  * For "most recently sent wins", use the edit time. Relative dates still resolve against the original `sent_at`.
  * Deletes keep the automatic Undo (CONTEXT.md requires it), recorded with `actor = system` and no `suppression` row.
  * When the Student presses Undo, restore `field_set_at` from the `before` values that `entity_version` already stores. No new column.
  * `edits.ts` then handles deletes only.
  * Record the decision in the ADR-0003 that is already planned, not in a new ADR.
  * Add three integration tests (typo-fix edit, delete and repost, edit after a later write) and one edit case to the AI eval.

### IZ-3. Stored AI output and replay (Stage 5 M6) is over-engineered; use one transaction per batch - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §2 (L177-182) compared with §10 (L471), file 64 `apply.ts`; Stage 5 M6, Stage 7 MAJ-11.
* **Scenario:** M6 adds an output column, a unique `(batch_id, op_index)` index and a replay path. All of that only covers a crash between applying the operations and marking the messages done.
* **Suggested fix:** Apply the whole batch in one transaction:
  * Each operation runs in its own savepoint.
  * If an operation fails, it rolls back to its savepoint and is recorded as rejected in the existing `decision` and `decision_reason` columns.
  * The messages are marked done at the end of the same transaction.
  * After a crash nothing has committed, so the batch just runs again. This also removes the contradiction between §2 and §10.
  * For MAJ-11, on worker startup set every `processing` row back to `pending`. The advisory lock means any such row is stale, so no timeout is needed.

### IZ-4. Re-queue messages instead of storing operations or adding retry endpoints - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** `unknown_course_mention.pending_ops` (L226), `resolveUnknownCourse` (L1066), §8 retries (L392); Stage 5 M4 and M5, Stage 7 MAJ-12, MAJ-14 and MAJ-19, Stage 6 C-M4 and C-N11.
* **Scenario:** Four fixes each add their own "apply later" mechanism:
  * replaying operations held for an Unknown Course;
  * "Apply anyway" for rejected operations;
  * parked operations that went over the cap;
  * re-driving dead messages.

  The message text is already kept for the whole Semester, so none of these needs to exist.
* **Suggested fix:**
  * (a) **Unknown Courses.** "Add course" and "Add as Nickname" set the mention's source messages back to `pending`, so the next batch re-runs them with the new name known. Replace `pending_ops` with a list of source message ids. This fixes MAJ-19 and C-N11.
  * (b) **NIM outages.** Drop the `dead` state for outages. Keep retrying every 60 minutes until NIM answers, while the existing alerts fire. Give up only when the AI's output fails validation twice. This removes the retry-count bug (N6, C-M4, MAJ-13), the retry endpoint and the re-drive counters.
  * (c) **Rejected and over-cap operations.** Mark the source message Possibly Missed. It already has a pre-filled Add button.
  * **Accepted risk:** a re-run message may mention items that were already applied. The AI sees those items in its context, so it should update them or do nothing. The M0 eval must include one re-run case to confirm this.

### IZ-5. Heartbeat: take the two-check fix, reject per-signal checks and the staleness rule - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §10 (L475-489), file 65 `health.ts`; Stage 5 M3, Stage 7 MAJ-16, Stage 6 C-M5 and C-N7.
* **Scenario:** MAJ-16 asks for five checks, one per signal. That may go past the free healthchecks.io plan (not checked). It also adds a "no message in 24 hours on a teaching weekday" rule. That rule needs to know about Break Weeks and Holidays, which only arrive in M2, so it would send false alerts at weekends and during breaks.
* **Suggested fix:**
  * Use two checks:
    * **Reminder path:** the scheduler ticked and the last email went out. This also shows the VM is up.
    * **Capture path:** `wa_socket` and `ai` are healthy.
  * Treat a paused AI as healthy (fixes C-M5).
  * Remove `backup` from the worker's checks, since it has its own check (fixes C-N7).
  * Keep direct alerts only for a WhatsApp logout and NIM 401/403 errors.
  * Do not add per-signal checks, a ping body or the staleness rule.

### IZ-6. Merge four validation fixes into two simpler rules - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §9 validation rules 3 and 5 (L440, L444), L456; Stage 5 M5 and N8, Stage 7 MAJ-14 and MAJ-24.
* **Scenario:** The current rules throw away three valid cases:
  * a project due during study leave;
  * "Semester extended to 15 Jan; report due 10 Jan" arriving in one batch;
  * a Class Representative posting 12 lab dates at once.

  Each earlier fix adds a special case for one of these, such as an Assignment window or ordering `extend_semester` first.
* **Suggested fix:**
  * **Dates:** use one sanity window measured from the message's `sent_at`, for example 7 days before to 180 days after, for every operation. This needs no ordering logic.
  * **Cap:** apply the 10-operation cap only to cancels, moves to a later date and `extend_semester`. Creates are already limited by the 30-message batch and can be reversed with batch Undo. Destructive operations over the cap become Possibly Missed (IZ-4c).
  * Reword L456 as MAJ-24 suggests.

### IZ-7. Digest safety net: merge Stage 5 M2 and Stage 7 MAJ-15 into one section - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §8 Daily Digest (L398), file 26 `digest.ts`, file 36 template; Stage 5 M2 and N10, Stage 7 MAJ-15.
* **Scenario:** M2 adds three digest sections. MAJ-15 adds a fourth and an immediate email for every cancellation. The immediate email is a new trigger and a new email type, while the next digest is at most 24 hours away.
* **Suggested fix:** Add one "Check these" section that lists:
  * Deadlines that an Auto Change cancelled or moved later, taken from the existing `entity_version` and `risk` data;
  * Possibly Missed messages, at most 5 plus "N more";
  * open Unknown Courses.

  The section counts as content when deciding whether to skip the digest. Reject the immediate cancellation email. N10's 14-day footer is optional.

### IZ-9. Email deliverability: merge Stage 5 M11 and Stage 7 MAJ-21, and reject webhooks - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** G2 (L29), L776, file 82; Stage 5 M11, Stage 7 MAJ-21.
* **Scenario:** Webhooks would need a public endpoint, signature checks and storage. They also would not catch the real failure: Gmail filing the email under Spam or Promotions still counts as "delivered".
* **Suggested fix:**
  * Add a Gmail filter step to `provision-vm.md`: "Never send to Spam" and "Categorise as Primary".
  * Add an M0 check that a Resend test email lands in Primary.
  * Reword G2 to measure "accepted by the provider".
  * No webhooks.

### IZ-10. Keeping reminders alive: take the cheap part, do not split out the scheduler now - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §10 startup checks (L468), file 58, `oom_score_adj` (L1287); Stage 5 M1, Stage 7 MAJ-03.
* **Scenario:** A separate scheduler container is another Node process of about 60-80 MB on the tightest resource (memory), plus a second thing to deploy.
* **Suggested fix:**
  * The worker exits at startup only if the database is unreachable or the encryption key fails to load. A missing NIM model only fails the `ai` signal.
  * Swap the OOM priority so the `web` container is killed first (one config value).
  * Drop "start the scheduler first", which means nothing once the loops are independent.
  * Keep the separate scheduler container as a fallback, only if M0 measurements show it is needed.

### IZ-11. Timetable fixes from later stages grow M1 and strengthen Stage 5 M8 - Severity: Major
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** CUJ 8, §9 occurrence operations (L424-426); Stage 6 C-M7 and C-N12, Stage 7 NIT-20.
* **Scenario:** Each of these fixes adds AI operations, eval cases, endpoints or UI for a feature that is not about deadlines.
* **Suggested fix:**
  * If the M1a/M1b split from M8 is accepted, move all three to M1b.
  * If not, use the smallest fix for C-M7:
    * an AI cancel or reschedule replaces any existing Session Change, as an upsert on the unique key that already exists;
    * "the class is back on" soft-deletes the Session Change;
    * the UI edits a Session Change by deleting it and creating a new one.

    No PATCH endpoint and no new AI operation.

### IZ-8. Fix the missing "mark opened" endpoint (C-M9) by deleting the feature - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** `auto_change.opened_at` (L224), L447, file 44, file 46 `markOpened`; Stage 6 C-M9, Stage 5 M8.
* **Scenario:** "Highlight until opened" only works on the dashboard. Once IZ-7 is in, the digest email already does this job.
* **Suggested fix:** Drop `opened_at`, `markOpened` and `highlightedChanges`. Keep `risk`, which the digest and the badge in the 48-hour list use.

### IZ-12. The Risks section (MAJ-01) should be short and add no new mitigations - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** Future Improvements (L765); Stage 7 MAJ-01 and MAJ-20.
* **Scenario:** A risk register scored by likelihood and impact, plus a second backup provider, would turn a documentation gap into new work.
* **Suggested fix:** Add about 6 rows, each giving the risk, what happens and the mitigation:
  * WhatsApp bans the number;
  * Baileys breaks;
  * NIM is retired;
  * email is filtered as spam;
  * credit or eligibility runs out.

  For MAJ-20, do a manual download of the latest backup on the credit end date. Do not add a second storage provider.

### IZ-13. Time zone: delete the setting rather than redesigning it - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §7 `PATCH /settings {timeZone}` (L344), §11 (L507); Stage 7 MAJ-22, Stage 6 C-N8.
* **Scenario:** One Student in one country does not need a time zone setting.
* **Suggested fix:** Remove the setting from the M1 API and UI. Keep the column, fixed to Asia/Colombo.

### IZ-14. How the web app signals the worker: use one rule - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** L384, file 47 (L1071), file 48 step 2 (L1079); Stage 5 M7, Stage 6 C-M3.
* **Scenario:** The design has two polling intervals plus an optional LISTEN/NOTIFY path. The 30-second wait during account deletion depends on which one applies.
* **Suggested fix:**
  * The worker always reads the `wa_session` row every 2 seconds.
  * Drop the 60-second interval and the LISTEN/NOTIFY option.
  * If the row is gone, the worker logs out of WhatsApp and closes the socket.

### IZ-15. Put all the cheap M0 additions on one checklist - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §15; Stage 7 MAJ-04, MAJ-08, MAJ-17 and NIT-23, Stage 5 N9 and M11.
* **Scenario:** These fixes are process steps with no app code, but they are spread across three reports.
* **Suggested fix:** Put them on one M0 checklist:
  * measure total memory with the stock Postgres container and an empty Next.js standalone app;
  * set the worker's memory threshold below its 256 MB limit;
  * one combined intake check: link a group after pairing and confirm its messages decrypt; stop the worker and confirm messages sent meanwhile arrive (merges MAJ-17 and N9);
  * hold back part of the test set and score the gate on that part only;
  * pin the notice in each group;
  * check that email lands in Gmail Primary (IZ-9).

  Store messages that cannot be decrypted as `kind = other` with a reason, and add no health count for them.

### IZ-16. Two pairing methods for one user (new, not in Stage 5) - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** §8 Pairing (L385), `wa_session` pairing columns (L236), file 57, file 61, `POST /whatsapp/pairing`.
* **Scenario:** The design builds both pairing-code and QR pairing, with a `pairing_method` column and a branch, for one Student who will re-link a few times a semester.
* **Suggested fix:** Support one method in M1, chosen after the M0 pairing-code reliability check.

### IZ-17. Cheap fixes that are clearly worth doing - Severity: Nit
* **Reviewer Lens:** `egm-zoom-out`
* **Location:** Various, across all three prior reports.
* **Scenario:** These fixes are wording changes or one-line design changes. None adds scope.
* **Suggested fix:**
  * **One editing pass for wording and consistency:** MAJ-05, 06, 07, 09, 23, 26 to 33; C-M2; C-N1 to C-N16; NIT-01 to NIT-15 and NIT-17.
  * **One-line design fixes:**
    * MAJ-10: a status change writes no version.
    * MAJ-18: include recently submitted items in the AI context.
    * NIT-16: record a skipped digest as an `email_log` row.
    * NIT-18: encrypt the pre-deploy dump with `age`.
    * NIT-24: hold the advisory lock on a dedicated connection.
    * C-M10: rejected output goes on the message's `decision_reason`; no new table.
    * C-M11: add a Semester form and a Nickname field, which CUJ 7 needs.
  * **MAJ-25 and N7:** accept that a crash can send an email twice and narrow the claim. Use Resend's idempotency header only if it is confirmed to exist.
  * **NIT-19:** record SSH exposure as a risk rather than restricting the address range.
  * **C-N17:** delete the "each Add becomes a test case" claim, since nothing implements it.
  * **Still open from Stage 5:** M8, M9, M10, N1 and N3. Each new write path that the later fixes add (re-open, hard delete, archive, re-queue) must also update the `reminder` table. That strengthens M9's case for dropping the table.

---

## Not checked / residual risk
* No claims about outside services were checked: Resend's idempotency header and webhooks, the healthchecks.io free-plan limits, and how Baileys handles groups linked after pairing. IZ-9, IZ-15 and IZ-17 depend on these.
* IZ-2 and IZ-4(a) rely on the AI matching existing items when a message is re-run. The M0 eval needs at least one re-run case before Auto Changes go live.
