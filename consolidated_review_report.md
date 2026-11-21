# Consolidated Review: Course-manager Technical Design

*   **Target:** `docs/designs/course-manager.md` (FeatureRange 1..768, DetailedRange 769..1426)
*   **Mode:** consolidated (all five stages, run without checkpoints). The document was not edited between stages.
*   **Goldfish context:** CONTEXT.md, GLOSSARY.md, ADR-0001, ADR-0002
*   **Date:** 2026-11-20

## Verdict

**Not ready to implement.** Six problems would cause wrong behaviour in the core path: messages are lost, corrections are lost, or alerts stop. They all sit in the WhatsApp → AI → reminder pipeline, and each has a known, contained fix. The rest falls into three groups: places where parts of the design don't connect, decisions left to the implementer, and claims that go further than the design supports.

Stage 8's main warning applies to every fix below: **take the smallest fix that works**. If every earlier suggestion were accepted as written, M1 would grow considerably without helping the goal any more. Where Stage 8 proposed a smaller fix, it is the one listed.

| Stage | Report | Blocker | Major | Nit |
|---|---|---|---|---|
| 5: Initial zoom out (zoom-out, inventive-catalyst) | `zoom_out_report.md` | 1 | 11 | 10 |
| 6: Comprehension | `comprehension_report.md` | 0 | 11 | 17 |
| 7: Critic (design, structural, style), lines 1–768 | `critic_report.md` | 1 | 33 | 27 |
| 8: Intermediate zoom out | `intermediate_zoom_out_report.md` | 0 | 10 | 7 |
| 9: Implementation readiness (readiness, codebase details, style), lines 769–1426 | `implementation_readiness_report.md` | 6 | 44 | 24 |
| **Raw total** | | **8** | **109** | **85** |
| **After consolidation** | this file | **5** | **24** | **1 group (about 60 items)** |

Raw IDs below are prefixed with their stage: `S5-B1`, `S7-MAJ-03`, `S9-M12` and so on.

---

## 🔴 Blockers

### A1. Edited and deleted messages lose corrections or delete Deadlines
*   **Problems:**
    - An edit arrives with the original message's id, so the unique key drops it.
    - Even when it gets through, reprocessing with the original `sent_at` loses the field-precedence check.
    - Undoing the original change adds a `suppression`, which then blocks the corrected item.
    - Deleting a message and reposting it takes the same path.
*   **Result:** "sorry, it's due Thursday" never reaches the app, and the reminder fires on the old date. Or the Assignment disappears.
*   **Fix (Stage 8's merged fix, IZ-2):**
    - Store every edit and every delete as its own inbox row with its own key (for example, the original id plus the edit timestamp). Process each one as a new message with its **own** time.
    - Undo triggered by the system uses `actor = system`, restores both the earlier values and the earlier `field_set_at` from `entity_version`, and **never** creates a suppression. Suppressions come only from the Student's own Undo or delete.
    - Add one evaluation case where an edited message corrects an existing item.
*   **Raw:** S5-B1, S6-C-M6, S6-C-M8, S7-BLK-01, S7-MAJ-23, S8-IZ-2, S9-B1, S9-B3

### A2. A crash in the middle of a batch is not safe
*   **Problems:**
    - §2, §10 and file 64 disagree about the transaction boundary.
    - Rows left in `processing` after a crash are never picked up again, and no health signal sees them.
    - Replaying a batch calls NIM again, which can give a different answer.
*   **Fix (IZ-3; storing the AI output for replay is rejected):**
    - Apply all of a batch's operations **and** mark its messages done in **one** transaction.
    - At startup and every loop, reset `processing` rows older than 10 minutes back to `pending`.
    - Count stuck rows in the `ai` signal.
    - Narrow §10's claim "a crash at any point…" to what this guarantees.
*   **Raw:** S5-M6, S7-MAJ-11, S7-MAJ-25, S8-IZ-3, S9-B2

### A3. Messages sent while the worker is down are dropped (to verify)
*   **Problem:** File 63 accepts only `notify` upserts. Baileys delivers messages that arrived while it was offline as `append`, so every deploy or restart would lose them.
*   **Fix:**
    - Accept both `notify` and `append` for linked groups; the unique key removes duplicates.
    - Check the event types through Context7.
    - Add a test to M0: restart the listener while a group is active, then compare message counts.
*   **Raw:** S9-B4, S5-N9, S7-MAJ-17

### A4. The heartbeat either stops forever or hides failures
*   **Problems:**
    - Nothing writes `health_signal(backup)`, so about 26 hours after deploy the worker stops pinging, and "down" alerts never stop.
    - One combined check means a known failure (for example, WhatsApp logged out) hides every later one, including the reminder path.
    - The backup failure is reported twice.
    - The deploy waits for a ping that may never come.
*   **Fix (IZ-5):**
    - **Two** healthchecks.io checks: **reminders** (scheduler + email) and **capture** (WhatsApp socket + AI). Each is pinged only when its own signals are healthy.
    - The backup keeps its own check, pinged by the script, and is removed from the worker's evaluation.
    - The deploy waits for a fresh `health_signal(scheduler)`, not for a ping.
    - Reject per-signal checks and the "no message in 24 hours" rule.
*   **Raw:** S9-B5, S5-M3, S7-MAJ-16, S6-C-N6, S6-C-N7, S8-IZ-5

### A5. The Activity Log has nowhere to store most of its entries
*   **Problem:** Rejected AI output, alerts, dead messages and oversized files have no table, and `email_log` has no cause column.
*   **Fix:** One `activity_event` table (`kind`, `payload jsonb`, `created_at`). The activity feed merges it with `auto_change`, `unknown_course_mention` and Possibly Missed messages. Alert de-duplication reads this table.
*   **Raw:** S9-B6, S6-C-M10

---

## 🟡 Majors

### Reliability of the reminder path (the goal)

**B1. Reminders stop when NIM fails, and the out-of-memory order kills the scheduler first.**
*   **Fix (IZ-10):**
    - A failed startup check disables only its own loop. If the NIM check fails, the AI loop is off and an alert is sent, but the scheduler and WhatsApp keep running.
    - Out-of-memory order: `web` is killed first, `worker` second, `postgres` last.
    - Don't split the scheduler into its own container unless M0's memory figures call for it.
*   **Raw:** S5-M1, S7-MAJ-03, S9-M34, S8-IZ-10

**B2. G2 and the digest rules don't match the design.**
*   **Problems:**
    - Untimed Exams get no Final Reminder.
    - A Deadline added after 07:00 and due the same day appears in no digest.
    - A digest skipped at 07:00 can be sent mid-afternoon or twice.
    - The CUJs don't show the "added" listing.
*   **Fix:**
    - Rewrite G2 with its exceptions stated.
    - A Deadline created less than 4 hours before it's due gets its Final Reminder immediately.
    - A digest is sent at most once a day, only between 07:00 and 09:00, and a skipped day is recorded.
    - Update CUJ 1 and CUJ 2.
*   **Raw:** S6-C-M1, S6-C-N13, S7-MAJ-05, S7-MAJ-33, S7-NIT-16, S7-NIT-22, S9-M13, S9-M26

**B3. AI mistakes never reach the inbox.**
*   **Fix (IZ-7):** The Daily Digest gets one **"Check these"** section covering anything since the last digest: cancellations, Deadlines moved later, Possibly Missed messages and Unknown Courses. There is no immediate email for each cancellation.
*   **Raw:** S5-M2, S7-MAJ-15, S8-IZ-7

**B4. Nothing checks that reminder emails actually arrive.**
*   **Fix (IZ-9; webhooks rejected):**
    - Add a Gmail filter step ("never send to spam", label "Course-manager") to the runbook.
    - Add an M0 check that a test email from Resend lands in the Primary inbox.
    - G2 counts emails *received*, checked in the student's weekly review.
    - Correct the description of the Resend test sender's limits.
*   **Raw:** S5-M11, S7-MAJ-21, S8-IZ-9, S9-M40

**B5. NIM retries, dead messages and the pause switch.**
*   **Problems:**
    - The retry count doesn't add up.
    - Dead messages can't be recovered, and the Possibly Missed check skips them.
    - Output that fails validation is lost.
    - Pausing looks like an outage.
*   **Fix (IZ-4):**
    - An outage never makes messages dead. Back off 1, 5, 15 and 60 minutes, then retry hourly, and alert after 1 hour.
    - Messages whose output fails validation go to Possibly Missed (the Student sees the text), not to a store of pending operations.
    - While paused, the `ai` signal counts as healthy, and the dashboard and digest show "Auto Changes paused".
    - Restate G3's 15-minute target as applying only when NIM is available.
*   **Raw:** S5-M4, S6-C-M4, S6-C-M5, S7-MAJ-06, S7-MAJ-12, S7-MAJ-13, S7-MAJ-14, S8-IZ-4, S9-M14, S9-M24

### Correctness of AI changes

**B6. The validation rules are too blunt.**
*   **Problems:** The 10-operation cap rejects whole legitimate batches. A Semester extension and a new due date in the same batch can be rejected together. Cancel and reschedule aren't checked against a real occurrence.
*   **Fix (IZ-6):** Two rules:
    - **(1) Every reference is real:** ids come from the context, and occurrences exist on their dates. Dates are checked after this batch's own `extend_semester` is applied.
    - **(2) Volume:** if a batch produces more than 10 operations, the first 10 are applied and the rest go to Possibly Missed, with an alert.
*   **Raw:** S5-M5, S5-N8, S7-NIT-20, S7-NIT-21, S8-IZ-6

**B7. Class changes can't be corrected.**
*   **Problems:** Only one Session Change is allowed per occurrence, `ops.v1` has no way to update or remove one, and there is no PATCH endpoint for it.
*   **Fix:** Add the `update_session_change` and `remove_session_change` operations (both go through `writeEntity`), plus `PATCH /api/v1/session-changes/:id`. Add a "the cancelled class is back on" evaluation case.
*   **Raw:** S6-C-M7, S9-M7 (in part)

**B8. Gaps in the AI context.**
*   **Problems:**
    - Submitted Assignments aren't in the context, so a repeated announcement creates a duplicate.
    - A second mention of the same Unknown Course loses its `pending_ops`.
    - It isn't defined how Session Group messages are handled in M1.
    - The prompt's time rules hard-code the time zone and are circular.
*   **Fix:**
    - Include Assignments submitted in the last 30 days.
    - Add a second mention's operations to the open mention.
    - In M1, apply Session Group messages as if they were for everyone, and log the group name.
    - Rewrite the time rules once the time zone is fixed (B11).
*   **Raw:** S7-MAJ-18, S7-MAJ-19, S6-C-N11, S6-C-N12, S9-M12, S9-M25

**B9. How AI operations map onto `writeEntity` is undefined.**
*   **Problems:** Writes that change nothing still bump the version, which blocks Undo. Whether a status change creates a history row is unclear. Status changes can block Undo of a wrong AI change.
*   **Fix:**
    - `writeEntity` skips writes that change nothing.
    - Status changes write a history row but don't change the version.
    - Specify the mapping from each operation to `writeEntity` (create, update, soft delete).
*   **Raw:** S7-MAJ-10, S6-C-N4, S9-M11

### Gaps in the plan

**B10. The web app → worker channel and pairing.**
*   **Problems:** The intervals conflict (2 s, 60 s, 30 s), no loop polls for requests, `getLinkStatus` doesn't exist, and the pairing flow is incomplete.
*   **Fix (IZ-14):** One rule. The worker reads its single `wa_session` row every 2 seconds and acts on any `*_requested_at`. Account deletion waits up to 10 seconds. Complete the pairing states.
*   **Author decision:** IZ-16 suggests keeping one pairing method (the code) instead of two.
*   **Raw:** S6-C-M3, S5-M7, S8-IZ-14, S8-IZ-16, S9-M20, S9-M21

**B11. The time zone setting.**
*   **Problems:** Changing the time zone moves every stored deadline, and the AI hard-codes Colombo anyway.
*   **Fix (IZ-13):** Remove the setting. v1 is fixed to Asia/Colombo, with one constant. *(Removing the setting is a scope change, so the author decides.)*
*   **Raw:** S6-C-N8, S7-MAJ-22, S8-IZ-13

**B12. Screens and endpoints are missing.**
*   **Problems:** There's no Semester screen (CUJ 7), no Nickname editor, and no endpoint for `markOpened`. CONFLICT is also used wrongly for a second Session Change.
*   **Fix:**
    - Add a Semester section to Settings and a Nickname editor on the Course page.
    - **Author decision (IZ-8):** delete the "opened" tracking, so highlighted changes stay for 7 days or until undone.
    - Use B7's PATCH instead of CONFLICT.
*   **Raw:** S6-C-M9, S6-C-M11, S9-M7, S9-M8, S8-IZ-8

**B13. The memory budget contradicts itself.**
*   **Problems:** M0 allows the worker up to 300 MB but the container is capped at 256 MB. The caps add up to more than "750 MB". The Compose settings don't match.
*   **Fix:** Say that the limits are caps, not expected use. Set the worker cap to the M0 figure plus 20%. Define 750 MB as total resident memory across all containers, averaged over 24 hours. Keep Compose consistent with that.
*   **Raw:** S6-C-M2, S7-MAJ-04, S9-M32

**B14. The M0 evaluation method is weak.**
*   **Problems:**
    - The prompt is tuned and graded on the same roughly 50 messages.
    - The case format is undefined, and `context.ts` is tied to the database.
    - The gate is worded differently in different places.
    - The spike could leak WhatsApp keys into git.
    - `m0-report.md` is described as throwaway.
*   **Fix:**
    - Split the messages into a tuning set and a held-out set, and grade only on the held-out set.
    - Define the case JSON format.
    - Make the context builder a pure function with a database adapter.
    - Use one wording for the gate.
    - Put the spike data under `spikes/m0/data/` (ignored by git) with its own README steps.
    - Keep `docs/m0-report.md`.
    - Put all the M0 additions on one checklist (IZ-15).
*   **Raw:** S7-MAJ-07, S7-MAJ-08, S9-M19, S9-M36, S9-M37, S9-M42, S8-IZ-15

**B15. G1's measure doesn't measure a Missed Deadline.**
*   **Fix:** G1 counts Missed Deadlines as the glossary defines them: Assignments in the app that were submitted after their due time, plus a list from the student of deadlines that never reached the app.
*   **Raw:** S7-MAJ-09

**B16. Build and ops decisions are left to the implementer.**
*   **Problems:**
    - Library major versions are unpinned; the bundler is "tsx or esbuild".
    - The CSP nonce needs middleware.
    - The images can't run `migrate` or `create-student`, and `disableSignUp` blocks account creation.
    - The lint allowlist blocks files that must import the database client, and some needed files are missing from the list.
    - `.env.example` is incomplete. The backup URL is malformed and the cron time is wrong. Nothing says how deploy files reach the VM.
    - The test setup contradicts itself, and the end-to-end tests will hit rate limits.
    - `EMAIL_API_BASE_URL` probably won't reach the Resend SDK.
    - Wrong premise: drizzle-kit can express partial indexes.
    - `student_id` doesn't match Better Auth's text id.
    - A hard-deleted Course leaves orphan rows.
    - How the Baileys auth store serialises its data is unspecified.
    - Globs are used where exact file names are known.
*   **Fix:**
    - Pin the major versions, and choose esbuild for the worker.
    - Generate the CSP nonce in `middleware.ts`.
    - Add a `tools` image target for `migrate` and `create-student`. Create the account through Better Auth's internal adapter, or turn sign-up on only for that script.
    - Correct the lint allowlist.
    - List every environment variable.
    - Fix the SAS URL format and run the cron at 02:00 Asia/Colombo.
    - Copy `compose.yaml`, `Caddyfile` and `ops/` to the VM with scp in the deploy job.
    - Name the test files consistently, and raise the rate limits in the test environment.
    - Call Resend's HTTP API with `fetch` instead of the SDK.
    - Use drizzle-kit for the indexes and checks.
    - Make `student_id` `text`.
    - Cascade deletes from Course.
    - Use BufferJSON for the auth store.
    - List exact file names.
    - Check every item marked "(verify)" through Context7 before implementing.
*   **Raw:** S9-M1, S9-M2, S9-M3, S9-M4, S9-M5, S9-M6, S9-M16, S9-M17, S9-M18, S9-M27, S9-M28, S9-M29, S9-M30, S9-M31, S9-M33, S9-M35, S9-M38, S9-M44, S6-C-N5, S6-C-N15, S6-C-N16

**B17. Auth details.**
*   **Problems:** The rate limits contradict each other (5 vs 3), and Better Auth isn't told to trust Caddy's `X-Forwarded-For`.
*   **Fix:** Use one rate-limit table. Configure Better Auth's trusted proxy setting, and check it through Context7.
*   **Raw:** S9-M15, S6-C-N3, S7-NIT-17

**B18. Account deletion sends its confirmation after the data is gone.**
*   **Fix:** Send the confirmation to the address read before the delete, then delete.
*   **Raw:** S9-M23

**B19. Backups sit in the same Azure subscription.**
*   **Problems:** One account problem takes out both the VM and its backups. The pre-deploy dump on the VM isn't encrypted.
*   **Fix (IZ-12):** Record this as an accepted risk in the new Risks section. Encrypt the pre-deploy dumps with `age` as well. Remind the student to download the latest backup monthly. Don't add a second provider.
*   **Raw:** S7-MAJ-20, S7-NIT-18, S5-N10

### Document quality

**B20. There is no Risks section, some claims go too far, and some references can't be followed.**
*   **Fix:**
    - Add a short **Risks** table (IZ-12, about 6 rows): a ban on the personal number, Baileys breaking after a WhatsApp change, NIM being retired or no longer free, email landing in spam, the Azure credit running out, and backups in the same subscription. It adds no new mitigations.
    - Narrow the claims: "worst a malicious message can do", "rollback is always safe", "library behaviour was checked".
    - Move every unverified item to Open Questions, and remove the ones the document already answers.
    - Replace review labels (C5, F1, Goldfish) with plain descriptions.
    - Point "Rejected by author" to `concepts_brief.md` and give the trade-off for E and L.
    - Fix the wording about ADR-0001's priced list and "M2 only adds tables" (the `session_group_id` foreign key comes in M2).
*   **Raw:** S7-MAJ-01, S7-MAJ-02, S7-MAJ-24, S7-MAJ-26, S7-MAJ-27, S7-MAJ-28, S7-MAJ-29, S7-MAJ-30, S7-MAJ-31, S7-MAJ-32, S8-IZ-12, S6-C-N1, S5-N5

**B21. Wording drifts from the glossary, and the doc-change instructions are stale.**
*   **Fix:**
    - Use the glossary terms (Student, Class Session, Occurrence, Possibly Missed).
    - Files 91 and 92 describe work already done; turn them into checks.
    - Widen the Activity Log glossary definition to cover the new entry types (A5).
    - Correct the ADR-0001 quote.
*   **Raw:** S9-M39, S9-M41, S9-M43, S7-NIT-09, S7-NIT-10, S7-NIT-26

### Scope (author decisions; `CLAUDE.md` requires asking)

**B22. M1 is bigger than the deadline problem needs.**
*   **Problems:**
    - Stage 5 and Stage 8 both say M1 does more than "zero missed Assignment deadlines" needs.
    - Accepting every fix as written would grow it further.
    - There are no checkpoints per phase.
*   **Options for the author:**
    - Split M1 into **M1a** (Assignments, Exams, reminders, the WhatsApp Link and AI, ops) and **M1b** (the timetable and Session Changes, the full Activity Log UI and the remaining screens).
    - Or keep M1 whole and accept the size.
    - Either way, map files to phases with a checkpoint for each.
*   **Raw:** S5-M8, S8-IZ-1, S8-IZ-11, S9-M22

**B23. Mechanisms that could be simpler.**
*   **The candidates:**
    - **(a) The `reminder` table:** calculate Final Reminders from the Deadlines on each tick instead, with sent reminders recorded in `email_log`.
    - **(b) Duplicate REST reads:** drop the GET endpoints the pages already read directly, keeping only the ones a script needs.
    - **(c) The conflict dialog:** replace it with "this item changed; reloaded" and a toast.
    - **(d) The M2 hook columns:** remove them until M2.
    - **(e) Precedence and history:** keep both `field_set_at` and `version`, but describe them as one mechanism.
    - **(f) Implementation detail:** reduce the function signatures and byte layouts in the implementation plan.
*   Each is smaller and none weakens the goal. **The author decides (a)–(d).** (e) and (f) are editorial changes.
*   **Raw:** S5-M9, S5-M10, S5-N1, S5-N2, S5-N3, S5-N4, S9-M9, S9-M10

---

## 🟢 Nits (apply in one editing pass; IZ-17 lists the cheap ones)

| Theme | Raw IDs |
|---|---|
| Wrong section references, wording left over from Server Actions, lower-case glossary terms | S6-C-N2, S7-NIT-01, S7-NIT-02, S9-N4, S9-N5, S9-N9 |
| Layout and formatting (sections in the wrong place, mixed bullets, strikethrough on decisions in force, code spans instead of links, incomplete diagrams) | S7-NIT-03, S7-NIT-05, S7-NIT-06, S7-NIT-07, S7-NIT-08, S7-NIT-15 |
| Vague or overstated phrases, numbers with no source | S7-NIT-11, S7-NIT-12, S7-NIT-13, S7-NIT-14, S7-NIT-25, S9-N1, S9-N2, S9-N3, S9-N14, S9-N15, S9-N16, S9-N19, S9-N20, S9-N22, S9-N23 |
| Small behaviour gaps (retry count vs "6th failure", sending and logging email as separate steps, the "4.30" rule, how suppressions expire, delete needing a version in the query, reverse-order Undo, the email path in the tree) | S5-N6, S5-N7, S6-C-N9, S6-C-N10, S9-N6, S9-N8, S9-N24 |
| Course deletion rule, archived text tied to *current* group links, DELETE semantics | S7-NIT-04, S9-N17 |
| Library details (async `params` in Next 15, plain 429 from Better Auth, disconnect reasons that loop, `npm audit` failing on Baileys' dependencies) | S9-N10, S9-N11, S9-N13, S9-N21 |
| Ops and security details (SSH exposure for deploys, M0 storing messages before the group notice is pinned, the advisory lock needs its own connection) | S7-NIT-19, S7-NIT-23, S7-NIT-24 |
| Missing glossary links and relationships (`ai_batch` → `inbox_message`), email provider listed as both open and decided, Possibly Missed → evaluation mechanism, password-reset template, offline-key step placement, ADR-0002 wording reused | S7-NIT-26, S7-NIT-27, S6-C-N14, S6-C-N17, S9-N7, S9-N12, S9-N18 |

---

## Traceability matrix

Every raw finding maps to exactly one consolidated item.

| Consolidated | Raw findings |
|---|---|
| A1 | S5-B1, S6-C-M6, S6-C-M8, S7-BLK-01, S7-MAJ-23, S8-IZ-2, S9-B1, S9-B3 |
| A2 | S5-M6, S7-MAJ-11, S7-MAJ-25, S8-IZ-3, S9-B2 |
| A3 | S5-N9, S7-MAJ-17, S9-B4 |
| A4 | S5-M3, S6-C-N6, S6-C-N7, S7-MAJ-16, S8-IZ-5, S9-B5 |
| A5 | S6-C-M10, S9-B6 |
| B1 | S5-M1, S7-MAJ-03, S8-IZ-10, S9-M34 |
| B2 | S6-C-M1, S6-C-N13, S7-MAJ-05, S7-MAJ-33, S7-NIT-16, S7-NIT-22, S9-M13, S9-M26 |
| B3 | S5-M2, S7-MAJ-15, S8-IZ-7 |
| B4 | S5-M11, S7-MAJ-21, S8-IZ-9, S9-M40 |
| B5 | S5-M4, S6-C-M4, S6-C-M5, S7-MAJ-06, S7-MAJ-12, S7-MAJ-13, S7-MAJ-14, S8-IZ-4, S9-M14, S9-M24 |
| B6 | S5-M5, S5-N8, S7-NIT-20, S7-NIT-21, S8-IZ-6 |
| B7 | S6-C-M7, S9-M7 (Session Change part) |
| B8 | S6-C-N11, S6-C-N12, S7-MAJ-18, S7-MAJ-19, S9-M12, S9-M25 |
| B9 | S6-C-N4, S7-MAJ-10, S9-M11 |
| B10 | S5-M7, S6-C-M3, S8-IZ-14, S8-IZ-16, S9-M20, S9-M21 |
| B11 | S6-C-N8, S7-MAJ-22, S8-IZ-13 |
| B12 | S6-C-M9, S6-C-M11, S8-IZ-8, S9-M7 (endpoint part), S9-M8 |
| B13 | S6-C-M2, S7-MAJ-04, S9-M32 |
| B14 | S7-MAJ-07, S7-MAJ-08, S8-IZ-15, S9-M19, S9-M36, S9-M37, S9-M42 |
| B15 | S7-MAJ-09 |
| B16 | S6-C-N5, S6-C-N15, S6-C-N16, S9-M1, S9-M2, S9-M3, S9-M4, S9-M5, S9-M6, S9-M16, S9-M17, S9-M18, S9-M27, S9-M28, S9-M29, S9-M30, S9-M31, S9-M33, S9-M35, S9-M38, S9-M44 |
| B17 | S6-C-N3, S7-NIT-17, S9-M15 |
| B18 | S9-M23 |
| B19 | S5-N10, S7-MAJ-20, S7-NIT-18 |
| B20 | S5-N5, S6-C-N1, S7-MAJ-01, S7-MAJ-02, S7-MAJ-24, S7-MAJ-26, S7-MAJ-27, S7-MAJ-28, S7-MAJ-29, S7-MAJ-30, S7-MAJ-31, S7-MAJ-32, S8-IZ-12 |
| B21 | S7-NIT-09, S7-NIT-10, S9-M39, S9-M41, S9-M43 |
| B22 | S5-M8, S8-IZ-1, S8-IZ-11, S9-M22 |
| B23 | S5-M9, S5-M10, S5-N1, S5-N2, S5-N3, S5-N4, S9-M9, S9-M10 |
| Nits | S5-N6, S5-N7, S6-C-N2, S6-C-N9, S6-C-N10, S6-C-N14, S6-C-N17, S7-NIT-01–08, S7-NIT-11–15, S7-NIT-19, S7-NIT-23–27, S9-N1–N24 (except where listed above), S8-IZ-17 |

## Not verified

The reviewers had no web access, and one of them had no Context7 access. These items need checking through Context7 or M0 before the fixes are written:

- **Baileys:**
  - `append` vs `notify` for messages that arrived while offline (A3);
  - how an edit and its timestamp are represented (A1);
  - BufferJSON for the auth store (B16);
  - which disconnect reasons can loop (Nits).
- **Better Auth:** the trusted-proxy setting and creating a user while `disableSignUp` is on (B16, B17).
- **Resend:** what the test sender is allowed to do, and whether there is an idempotency header (B4).
- **healthchecks.io:** the free-plan check limit (A4).
- **Next.js:** async `params` and generating the CSP nonce in middleware (B16, Nits).
- **drizzle-kit:** partial index support (B16).
