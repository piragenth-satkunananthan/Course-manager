# Goldfish Annotated Review Report

**Status:** resolved: fixes applied, and the author decided U1–U12 on 2026-11-21 (all applied to the design)
**Target:** `docs/designs/course-manager.md` (full file)
**Findings source:** the 202 raw findings from Stages 5–9, grouped as in `consolidated_review_report.md`
**Date:** 2026-11-21

## How to read this

Each consolidated item below has one of these categories:

- **PROPOSE FIX**: the finding is valid, and the fix has been applied to the design.
- **PROPOSE FIX (held)**: the finding is valid, but the fix changes scope, so `CLAUDE.md` requires your decision. It has **not** been applied. Where the document needed to stay consistent in the meantime, a small interim fix was applied and labelled.
- **CONTEST**: the reviewer is wrong. The evidence cited is in the design document, which the reviewer could read.
- **DECLINE**: a valid Nit that isn't worth changing. It is recorded and not fixed.

**No finding was ESCALATED.** Every disagreement could be checked against something in the documents the reviewers had.

Six library facts were checked through Context7 before the fixes were written:

- Baileys has two upsert types, `notify` and `append`.
- An edit arrives as `messages.update` on the **original** message key, carrying the edit's own `messageTimestamp`.
- Better Auth's `advanced.ipAddress.ipAddressHeaders` and `trustedProxies` control which client IP is used.
- `disableSignUp` blocks only the public `/sign-up/email` route.
- `auth.$context.internalAdapter.createUser` plus `linkAccount` creates a user from a script.

Still unverified, and moved to the design's Open Questions:

- the exact event shape of a revoke (delete) in Baileys;
- Resend's `Idempotency-Key` header;
- healthchecks.io's free-plan check limit.

The name is still **Course-manager**, as you decided on 2026-11-20. Your message said "CourseDock", but nothing was renamed.

---

## Decisions for the author: resolved 2026-11-21

The author chose the recommended option for every item, and for U4 kept the basic timetable in M1a. The design's "Decisions made after the review" table records the final choices. The table below keeps the options as they were presented.

U1–U9 are scope or architecture changes, held for you as `CLAUDE.md` requires. U10–U12 are choices I made while fixing other findings, and they need your confirmation.

| # | Decision | What the reviewers proposed | What the design does now (interim) | Raw findings |
|---|---|---|---|---|
| **U1** | How many ways to pair WhatsApp | Keep only the pairing code and drop the QR (IZ-16): less code, one flow to test | Keeps both: the code is the default, and the QR is for a laptop | S8-IZ-16 |
| **U2** | Time zone setting | Remove it and fix v1 to Asia/Colombo (IZ-13) | Keeps the setting. Its meaning is now stated: stored class and due times are local wall-clock times, so changing the zone keeps "23:59" as 23:59 and moves the instant. The settings page warns about this. | S8-IZ-13 (S7-MAJ-22 and S6-C-N8 are fixed either way) |
| **U3** | Highlighting of "opened" changes | Delete `opened_at`, so risky changes are highlighted for 7 days or until undone (IZ-8) | Keeps it, and adds the missing endpoint `POST /api/v1/auto-changes/:id/opened` | S8-IZ-8 |
| **U4** | Size of M1 | Split it into M1a (Assignments, Exams, reminders, WhatsApp/AI, ops) and M1b (timetable and Session Changes, the full Activity Log UI, remaining screens) (S5-M8, IZ-1, IZ-11) | Keeps M1 whole. The build order now has phase checkpoints, so a split later is a relabel. | S5-M8, S8-IZ-1, S8-IZ-11 |
| **U5** | The `reminder` table | Remove it, calculate Final Reminders from Deadlines on each tick, and record sends in `email_log` (S5-M9) | Keeps the table: `writeEntity` upserts it in the same transaction as the Deadline write | S5-M9 |
| **U7** | The conflict dialog | Replace it with "this item changed; reloaded" and a toast (S5-N3) | Keeps the dialog. The CONFLICT body now returns the current item, so it can work. | S5-N3 |
| **U8** | M2 placeholder columns | Remove `repeat_every_weeks`, `starts_week` and `session_group_id` until M2 (S5-N1) | Keeps them. `session_group_id` has no foreign key until M2, and the text no longer says "M2 only adds tables". | S5-N1 |
| **U9** | A backup copy outside Azure | Store a second copy outside the Azure subscription (S7-MAJ-20) | Accepted risk, written in the Risks section, plus a monthly manual download of the latest backup by the student | S7-MAJ-20 |
| **U10** | Privacy vs reliability for newly linked groups | (raised by S9-M36) | Keeps `shouldIgnoreJid`, so unlinked chats are dropped inside Baileys and never decrypted. A group linked later may fail to decrypt its first messages until WhatsApp re-sends the sender key; this is tested in M0. The alternative is to decrypt every chat in memory and drop unlinked ones in our own code. That is more reliable but weaker on privacy. | S9-M36 |
| **U11** | Session Group messages in M1 | (raised by S6-C-N12) | M1 has no Session Groups, so a group-specific message ("Group B lab cancelled") is **not applied**. It goes to Possibly Missed with the group name, so the student decides. The alternative is to apply it to everyone. | S6-C-N12 |
| **U12** | How the AI reads times like "4.30" | (raised by S6-C-N9) | With no am/pm: hours 1–7 mean pm (4.30 → 16:30), hours 8–11 mean am, and 12 means noon. "Morning", "am", "pm", "evening" or "tonight" override this. Checked against real messages in M0. | S6-C-N9 |

(U6 is not used: its finding was contested; see B23b.)

---

## Prioritized Findings & AI Suggestions

### [A1] [`zoom-out, inventive-catalyst, comprehension, design, implementation-readiness, codebase-details`] - Severity: Blocker
*   **Affected Scope:** §3 (`inbox_message`, the Undo rule), §8 (WhatsApp Link), §9 (edits and deletes), files 24, 63 and 64 (Edited and deleted messages)
*   **Discrepancy Description:** An edit arrives under the original message id, so the unique key drops it. When it does get through, it keeps the original `sent_at` and loses the precedence check. The Undo it triggers adds a suppression, which blocks the corrected item. Deleting and reposting a message takes the same path.
*   **Rationale:** a corrected deadline never reaches the app, and the reminder fires on the old date. Or the Assignment disappears.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Context7 confirms that an edit is emitted as `messages.update` on the original key, with the edit's own timestamp. Stage 8's merged fix (IZ-2) is the smallest one that works.
*   ***Proposed Edit:***
    *   Location: §3 `inbox_message`, the Undo rule, the precedence rule; §8 WhatsApp Link; §9 edits and deletes; files 24, 63 and 64
    *   Change:
        - `inbox_message.kind` gains `edit` and `revoke`.
        - An edit is stored as its own row, `wa_message_id = <original id>:edit:<edit epoch>`, with `sent_at` set to the edit's timestamp. A revoke is stored as `<original id>:revoke`.
        - Undo caused by an edit or a delete uses `actor = system`, restores the `before` values **and** the earlier `field_set_at`, and never adds a suppression. Suppressions come only from the Student's own Undo or delete.
        - An evaluation case covers an edit that corrects an existing item.
    *   Applied: yes

### [A2] [`zoom-out, design, implementation-readiness`] - Severity: Blocker
*   **Affected Scope:** §2, §10 and file 64 (crash safety)
*   **Discrepancy Description:** §2, §10 and file 64 disagree on where the transaction boundary is. Rows left in `processing` are never picked up again. A replay calls NIM again and may get a different answer.
*   **Rationale:** a crash can create duplicate changes or leave messages stuck forever.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Storing the AI output for replay (S5-M6) is rejected as over-engineered (IZ-3). One transaction per batch is enough for one Student.
*   ***Proposed Edit:***
    *   Location: §2, §3 (`ai_batch` to `inbox_message`), §10 idempotency, file 64
    *   Change:
        - All of a batch's operations and its message status updates commit in **one** transaction.
        - `processing` rows older than 10 minutes go back to `pending`, both at startup and on every loop.
        - Stuck rows count against the `ai` signal.
        - The claim "a crash at any point…" is narrowed to "a crash before commit is retried; a crash after commit has nothing left to do".
    *   Applied: yes

### [A3] [`codebase-details, zoom-out, design`] - Severity: Blocker
*   **Affected Scope:** §8 and file 63 (message intake)
*   **Discrepancy Description:** Only `notify` upserts are accepted, so messages delivered while the worker was offline (`append`) would be lost.
*   **Rationale:** every deploy or restart would lose announcements.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Context7 confirms the two upsert types (`'append' | 'notify'`). With history sync off, `append` brings in no back-history.
*   ***Proposed Edit:***
    *   Location: §8, file 63, file 71, §15
    *   Change: accept both types for linked groups, with duplicates removed by the unique key; add an "offline" fixture; add an M0 restart test.
    *   Applied: yes

### [A4] [`zoom-out, comprehension, design, implementation-readiness`] - Severity: Blocker
*   **Affected Scope:** §10, §14 and files 65, 78 and 79 (heartbeat)
*   **Discrepancy Description:** Nothing writes `health_signal(backup)`, so the worker would stop pinging permanently. One combined check hides later failures. The backup is alerted twice. The deploy waits for a ping that may never come.
*   **Rationale:** the outside alarm (G4) either never stops sending alerts or stays silent after one failure.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** IZ-5's two-check version is the smallest fix that keeps the reminder path visible on its own.
*   ***Proposed Edit:***
    *   Location: §10, §14, files 10, 65, 78, 79, 82
    *   Change:
        - Two healthchecks.io checks: **reminders** (`scheduler` and `email`) and **capture** (`wa_socket` and `ai`).
        - The backup is pinged only by the backup script, which writes `health_signal(backup)` through `psql`. The worker no longer evaluates it.
        - The deploy waits for a fresh `health_signal(scheduler)`.
    *   Applied: yes

### [A5] [`comprehension, implementation-readiness`] - Severity: Blocker
*   **Affected Scope:** §3, §10, files 17 and 46 (Activity Log storage)
*   **Discrepancy Description:** Rejected AI output, alerts, oversized files and stuck messages have no table.
*   **Rationale:** the feed and the alert de-duplication can't be built.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** One table covers every kind of entry.
*   ***Proposed Edit:***
    *   Location: §3, §4, §10, files 17, 46, 65
    *   Change: add `activity_event` (`kind`, `payload jsonb`, `created_at`). The feed merges it with `auto_change`, `unknown_course_mention` and Possibly Missed messages. Alerts are de-duplicated by `kind` plus `payload.cause` within 12 hours.
    *   Applied: yes

### [B1] [`zoom-out, design, codebase-details`] - Severity: Major
*   **Affected Scope:** §1, §10 and files 58 and 75 (worker startup and memory-kill order)
*   **Discrepancy Description:** A failed NIM check exits the whole worker, which stops reminders. The out-of-memory killer kills the worker, and with it the scheduler, first.
*   **Rationale:** both break the goal.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** IZ-10 rejects splitting the scheduler into its own container; the cheap fix is enough.
*   ***Proposed Edit:***
    *   Location: §1, §10, files 58, 75
    *   Change:
        - Each loop has its own startup check. If NIM fails, only the AI loop stops, an alert is sent, and the check is retried every 5 minutes.
        - Memory-kill order: `oom_score_adj` is web +500, worker +200, postgres -500.
    *   Applied: yes

### [B2] [`comprehension, design, structural, implementation-readiness`] - Severity: Major
*   **Affected Scope:** G2, CUJ 1, CUJ 2, §8 scheduler, files 25, 26 and 65
*   **Discrepancy Description:** G2's promise has exceptions it doesn't state. A Deadline added after 07:00 and due the same day appears in no digest. A digest can go out in the afternoon or twice.
*   **Rationale:** the goal can't be checked.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The fixes either state the exceptions or remove them.
*   ***Proposed Edit:***
    *   Location: G2, CUJ 1, CUJ 2, §8, files 25, 26, 65
    *   Change:
        - G2 is rewritten with its exceptions and is measured on emails received.
        - A Deadline less than 4 hours away gets its Final Reminder on the next tick.
        - The digest is sent at most once a day, only between 07:00 and 09:00 local time. An empty day is recorded as `skipped`.
        - CUJ 1 and CUJ 2 show which digests list the item.
    *   Applied: yes

### [B3] [`zoom-out, design`] - Severity: Major
*   **Affected Scope:** §8 digest, files 26 and 36
*   **Discrepancy Description:** AI mistakes (cancellations, Deadlines moved later, Possibly Missed messages, Unknown Courses) are only visible in the web app.
*   **Rationale:** the student reads email, not the app.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** One digest section is enough (IZ-7). There is no immediate email for each change.
*   ***Proposed Edit:***
    *   Location: §8, files 26, 36
    *   Change: the digest gets a **"Check these"** section with everything since the last digest.
    *   Applied: yes

### [B4] [`zoom-out, design, style`] - Severity: Major
*   **Affected Scope:** G2, §15, file 82 and the Resend note (email delivery)
*   **Discrepancy Description:** Nothing checks that emails reach the inbox. The description of Resend's test sender is ambiguous.
*   **Rationale:** reminders that land in spam are as bad as no reminders.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** IZ-9: no webhooks, just a filter step and an M0 check.
*   ***Proposed Edit:***
    *   Location: G2, the Implementation Plan's fixed choices, §15, file 82
    *   Change:
        - A Gmail filter step: never send to spam, label "Course-manager".
        - An M0 check that the email lands in the Primary inbox.
        - The test sender is "delivers only to the address the Resend account was registered with, so register Resend with the Student's Gmail".
    *   Applied: yes

### [B5] [`zoom-out, comprehension, design, structural, implementation-readiness`] - Severity: Major
*   **Affected Scope:** G3, §8, §10 and file 64 (retries, dead messages, pause)
*   **Discrepancy Description:** The retry count doesn't add up. Dead messages can't be recovered. Output that fails validation is lost. Pausing looks like an outage.
*   **Rationale:** an NIM outage silently loses announcements, and pausing sends a false alarm.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** IZ-4: put messages back in the queue instead of storing operations.
*   ***Proposed Edit:***
    *   Location: G3, §8, §10, file 64
    *   Change:
        - An outage no longer makes messages dead. Retries back off 1, 5, 15 and 60 minutes, then go hourly, with an alert after 1 hour.
        - Output that fails validation sends its messages to Possibly Missed.
        - While Auto Changes are paused, `ai` counts as healthy, and a banner plus a line in the digest say so.
        - G3 applies while NIM is reachable.
    *   Applied: yes

### [B6] [`zoom-out, inventive-catalyst, design`] - Severity: Major
*   **Affected Scope:** §9 validation
*   **Discrepancy Description:** The 10-operation cap rejects whole batches. A Semester extension and a new due date in the same batch can be rejected together. Cancel and reschedule aren't checked against a real occurrence.
*   **Rationale:** legitimate changes are thrown away.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** IZ-6: two rules.
*   ***Proposed Edit:***
    *   Location: §9, file 64
    *   Change:
        - Rule 1: every reference is real. Ids come from the context, occurrences exist on their dates, and dates are checked after the batch's own `extend_semester` is applied.
        - Rule 2: volume. The first 10 operations are applied, and the rest go to Possibly Missed with an alert.
    *   Applied: yes

### [B7] [`comprehension, implementation-readiness`] - Severity: Major
*   **Affected Scope:** §7, §9, files 30 and 41 (correcting Session Changes)
*   **Discrepancy Description:** There is no operation or endpoint to change or remove an existing Session Change.
*   **Rationale:** "sorry, 4 not 3" and "the class is back on" can't be applied.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** These are cases the product needs.
*   ***Proposed Edit:***
    *   Location: §7, §9, files 30, 41, 51, 72
    *   Change: add the `update_session_change` and `remove_session_change` operations, `PATCH /api/v1/session-changes/:id`, and an evaluation case.
    *   Applied: yes

### [B8] [`design, comprehension, implementation-readiness`] - Severity: Major
*   **Affected Scope:** §9 context and prompt
*   **Discrepancy Description:** Submitted Assignments are missing from the context. A second mention of an Unknown Course loses its operations. Session Group handling is undefined. The time rules are circular.
*   **Rationale:** duplicates are created, operations are lost, and behaviour is undefined.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: §9, file 64
    *   Change:
        - The context includes Assignments submitted in the last 30 days.
        - A repeat mention adds its operations to the open entry.
        - Session Group messages follow U11.
        - Times resolve in the Student's time zone, using the U12 rule.
    *   Applied: yes

### [B9] [`design, comprehension, implementation-readiness`] - Severity: Major
*   **Affected Scope:** §3 and files 24, 37 and 42 (`writeEntity`)
*   **Discrepancy Description:** A write that changes nothing still bumps the version and blocks Undo. Whether a status change gets a history row is unclear. Mapping from operation to write is undefined.
*   **Rationale:** Undo gets blocked for no reason.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: §3, files 24, 37, 42, 64
    *   Change:
        - `writeEntity` skips writes that change nothing.
        - A status change writes an `entity_version` row (`op = status`) without changing `version`.
        - The mapping from each operation to `writeEntity` is listed in file 64.
    *   Applied: yes

### [B10] [`zoom-out, comprehension, implementation-readiness`] - Severity: Major
*   **Affected Scope:** §8 and files 47, 48, 58 and 61 (web app → worker channel)
*   **Discrepancy Description:** The polling intervals conflict. No loop reads the requests. `getLinkStatus` doesn't exist. The pairing flow is incomplete.
*   **Rationale:** an implementer would have to guess.
*   ***AI Suggestion:*** PROPOSE FIX (the channel). Dropping a pairing method is held as **U1**.
*   ***Justification:*** IZ-14: one rule.
*   ***Proposed Edit:***
    *   Location: §8, files 47, 48, 58, 61
    *   Change:
        - A fourth worker loop reads the single `wa_session` row every 2 seconds and acts on any `*_requested_at`.
        - Account deletion waits up to 10 seconds.
        - The pairing states are listed.
        - `getLinkStatus` is replaced with `GET /api/v1/whatsapp`.
    *   Applied: yes (the channel only)

### [B11] [`comprehension, design`] - Severity: Major
*   **Affected Scope:** §3, §9, §11 and file 48 (time zone)
*   **Discrepancy Description:** Changing the time zone moves stored deadlines, and the AI hard-codes Colombo anyway.
*   **Rationale:** the meaning of a time zone change is undefined.
*   ***AI Suggestion:*** PROPOSE FIX (the meaning, and the AI using the Student's time zone). Removing the setting is held as **U2**.
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: §3, §9, §11, file 48
    *   Change: as described in U2's interim column.
    *   Applied: yes (interim)

### [B12] [`comprehension, implementation-readiness`] - Severity: Major
*   **Affected Scope:** §7, §11 and files 51, 55 and 57 (missing screens and endpoints)
*   **Discrepancy Description:** There's no Semester screen (CUJ 7), no Nickname editor, and no endpoint for `markOpened`.
*   **Rationale:** M1 can't be finished as specified.
*   ***AI Suggestion:*** PROPOSE FIX. Deleting `opened_at` is held as **U3**.
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: §7, §11, files 51, 55, 57
    *   Change: add a Semesters section to `/settings` (`semester-manager`), a `nickname-editor` on the Course page, and `POST /api/v1/auto-changes/:id/opened`.
    *   Applied: yes

### [B13] [`comprehension, design, implementation-readiness`] - Severity: Major
*   **Affected Scope:** G5, §1, §15 and file 75 (memory budget)
*   **Discrepancy Description:** M0 allows the worker 300 MB, but its cap is 256 MB. The caps add up to more than 750 MB. "Steady state" isn't defined.
*   **Rationale:** a worker that passes M0 could be killed in production.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: G5, §1, §15, file 75
    *   Change:
        - The limits are caps, not expected use.
        - The worker cap is 320 MB (M0's 300 MB pass mark is the expected figure).
        - 750 MB is the total resident memory of all containers, averaged over 24 hours.
        - The other caps are adjusted to match.
    *   Applied: yes

### [B14] [`design, structural, implementation-readiness, codebase-details`] - Severity: Major
*   **Affected Scope:** G3, §13, §15 and files 1–4, 9, 67 and 72 (M0 method)
*   **Discrepancy Description:** The prompt is tuned and graded on the same messages. The case format is undefined, and `context.ts` is tied to the database. The gate is worded differently in different places. The spike could leak keys into git. The M0 report is described as throwaway.
*   **Rationale:** the gate could pass without proving anything.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: G3, §13, §15, files 1–4, 9, 64, 67, 72
    *   Change:
        - A tuning set and a held-out set; the gate is graded on the held-out set only.
        - The case JSON format is defined.
        - The context builder is a pure function with a database adapter.
        - The gate has one wording.
        - Spike data lives in `spikes/m0/data/`, which git ignores, and the report is kept.
        - M0 has one checklist.
    *   Applied: yes

### [B15] [`design`] - Severity: Major
*   **Affected Scope:** G1
*   **Discrepancy Description:** G1's measure doesn't measure a Missed Deadline as the glossary defines it.
*   **Rationale:** G1 couldn't be checked against the glossary's meaning.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: G1
    *   Change: G1 counts Missed Deadlines as the glossary defines them.
    *   Applied: yes

### [B16] [`implementation-readiness, codebase-details, comprehension`] - Severity: Major
*   **Affected Scope:** the Implementation Plan's fixed choices, §5, §14 and files 5, 8, 10, 11, 13, 14, 17, 18, 35, 59, 66, 70, 74, 75, 78, 79 and 81
*   **Discrepancy Description:** Library versions, the bundler, CSP nonce generation, the tool entry points, the lint allowlist, the environment variables, the backup URL and timing, file delivery to the VM, test naming, the email base URL, partial indexes, the `student_id` type, the Course cascade, auth store serialisation and globs are all undecided or wrong.
*   **Rationale:** an implementer would have to decide each one.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Context7 confirms the Better Auth user-creation path. The rest are mechanical.
*   ***Proposed Edit:***
    *   Location: the files listed above
    *   Change:
        - Majors are pinned to the versions M0 tests.
        - esbuild bundles `dist/worker.js`, `dist/migrate.js` (drizzle-orm's `migrate()`) and `dist/create-student.js` into the worker image.
        - The CSP nonce is generated in `src/middleware.ts`.
        - The lint allowlist is corrected, and `.env.example` is complete.
        - Backups use `curl --upload-file` to `$BACKUP_CONTAINER_URL/<name>?$BACKUP_SAS`, with cron at `30 20 * * *` UTC.
        - The deploy copies `compose.yaml`, `Caddyfile` and `ops/` to the VM with scp.
        - Test files are named consistently, and the test environment has looser rate limits.
        - Email is sent with `fetch` to `${EMAIL_API_BASE_URL}/emails`; the Resend SDK is dropped.
        - Indexes and checks are declared in `schema.ts`, and generated SQL is never hand-edited.
        - `student_id` is `text`.
        - Deletes cascade from Course.
        - The Baileys auth store uses `BufferJSON` and `initAuthCreds`, with `makeCacheableSignalKeyStore`.
        - Exact file lists replace globs.
    *   Applied: yes

### [B17] [`implementation-readiness, design, comprehension`] - Severity: Major
*   **Affected Scope:** §5, files 31 and 77 (rate limits and client IP)
*   **Discrepancy Description:** The rate limits contradict each other, and the client IP isn't configured.
*   **Rationale:** the limiter counts the wrong IP, or none at all.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** Context7: `advanced.ipAddress.ipAddressHeaders`.
*   ***Proposed Edit:***
    *   Location: §5, files 31, 77
    *   Change:
        - One table: sign-in 5 per 60 s, password-reset request 3 per 60 s.
        - Caddy sets `X-Real-IP {remote_host}`, and Better Auth uses `ipAddressHeaders: ["x-real-ip"]`.
        - `web` is reachable only through Caddy.
    *   Applied: yes

### [B18] [`implementation-readiness`] - Severity: Major
*   **Affected Scope:** file 48 (account deletion)
*   **Discrepancy Description:** The confirmation email is sent after the data it needs has been deleted.
*   **Rationale:** the confirmation can't be sent.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: file 48
    *   Change: read the email address first, send the confirmation, then delete.
    *   Applied: yes

### [B19] [`design`] - Severity: Major
*   **Affected Scope:** Risks, §14, files 78 and 82 (backups)
*   **Discrepancy Description:** The backups are in the same subscription as the VM, and the pre-deploy dump is unencrypted.
*   **Rationale:** one account problem loses everything.
*   ***AI Suggestion:*** PROPOSE FIX (encryption and an accepted-risk entry). The off-Azure copy is held as **U9**.
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: Risks, §14, files 78, 82
    *   Change: encrypt pre-deploy dumps with `age`, add a monthly manual download to the runbook, and add a Risks row.
    *   Applied: yes

### [B20] [`design, structural, style, comprehension, zoom-out`] - Severity: Major
*   **Affected Scope:** the whole document (risks, claims, references)
*   **Discrepancy Description:**
    - There is no Risks section.
    - Some claims go further than the design supports.
    - Unverified items are scattered through the body.
    - Review labels (C5, F1, Goldfish) can't be looked up.
    - "Rejected by author" has no source.
    - The ADR-0001 wording and "M2 only adds tables" are inaccurate.
*   **Rationale:** a reader can't tell what is proven.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** The source record (`concepts_brief.md`) exists in the repo and is now linked, because a human reader needs it too.
*   ***Proposed Edit:***
    *   Location: throughout
    *   Change:
        - A Risks section with 7 rows.
        - The claims are narrowed.
        - Open Questions holds every unverified item.
        - The review labels are replaced with plain descriptions.
        - Alternatives cite `concepts_brief.md`, and E and L state their trade-offs.
        - The `CLAUDE.md` rule is quoted.
        - The ADR-0001 and M2 wording is corrected.
    *   Applied: yes

### [B21] [`implementation-readiness, style`] - Severity: Major
*   **Affected Scope:** throughout, plus files 91 and 92 (glossary drift)
*   **Discrepancy Description:** Terms drift from the glossary. Files 91 and 92 describe work that is already done. The Activity Log definition is too narrow.
*   **Rationale:** the wording no longer matches the glossary.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: throughout, files 91, 92, `GLOSSARY.md`
    *   Change: use the glossary terms; turn files 91 and 92 into checks; widen the Activity Log definition.
    *   Applied: yes

### [B22] [`zoom-out, implementation-readiness`] - Severity: Major
*   **Affected Scope:** the build order and the milestones (M1 size)
*   **Discrepancy Description:** M1 is bigger than the deadline problem needs, and the build has no phase checkpoints.
*   **Rationale:** a long build before any value is delivered.
*   ***AI Suggestion:*** PROPOSE FIX for the checkpoints. The split is held as **U4**.
*   ***Justification:*** —
*   ***Proposed Edit:***
    *   Location: the build order
    *   Change: list the phases P1–P8, each with its files and an exit check.
    *   Applied: yes

### [B23] [`zoom-out, implementation-readiness`] - Severity: Major
*   **Affected Scope:** §3, §7 and file 57 (simplification candidates)
*   **Discrepancy Description:** Mechanisms that could be simpler: (a) the reminder table, (b) duplicate REST reads, (c) the conflict dialog, (d) M2 hooks, (e) three overlapping mechanisms, (f) too much implementation detail. API response shapes are also undefined, and the conflict dialog can't work with the error body.
*   **Rationale:** less code for the same goal.
*   ***AI Suggestion:***
    - (a), (c) and (d): PROPOSE FIX (held: **U5**, **U7**, **U8**).
    - (b): **CONTEST**. D3 chose REST so that scripts and a future app can read; this is recorded in "Decisions made while drafting".
    - (e): **CONTEST**. §3 shows that `version`, `field_set_at` and `entity_version` each do a different job.
    - (f): **CONTEST**. The Implementation Plan's first paragraph says it must leave no impactful decisions, and Stage 9 asked for more detail.
    - Response shapes and the CONFLICT body: PROPOSE FIX.
*   ***Justification:*** see each part.
*   ***Proposed Edit:***
    *   Location: §7
    *   Change: DTO conventions and the main DTO fields; CONFLICT returns `current`.
    *   Applied: the response shapes and CONFLICT only

### [Nits] [`all`] - Severity: Nit
*   **Affected Scope:** see the table
*   ***AI Suggestion:*** 41 PROPOSE FIX (applied in one pass, IZ-17) and 8 DECLINE (style only, or already covered). Reasons are in the table.

---

## Every raw finding

| Raw ID | Item | Category | Note |
|---|---|---|---|
| S5-B1 | A1 | PROPOSE FIX |  |
| S6-C-M6 | A1 | PROPOSE FIX |  |
| S6-C-M8 | A1 | PROPOSE FIX |  |
| S7-BLK-01 | A1 | PROPOSE FIX |  |
| S7-MAJ-23 | A1 | PROPOSE FIX |  |
| S8-IZ-2 | A1 | PROPOSE FIX |  |
| S9-B1 | A1 | PROPOSE FIX |  |
| S9-B3 | A1 | PROPOSE FIX |  |
| S5-M6 | A2 | PROPOSE FIX |  |
| S7-MAJ-11 | A2 | PROPOSE FIX |  |
| S7-MAJ-25 | A2 | PROPOSE FIX |  |
| S8-IZ-3 | A2 | PROPOSE FIX |  |
| S9-B2 | A2 | PROPOSE FIX |  |
| S5-N9 | A3 | PROPOSE FIX | Context7 confirms `notify` and `append` upsert types |
| S7-MAJ-17 | A3 | PROPOSE FIX | Context7 confirms `notify` and `append` upsert types |
| S9-B4 | A3 | PROPOSE FIX | Context7 confirms `notify` and `append` upsert types |
| S5-M3 | A4 | PROPOSE FIX |  |
| S6-C-N6 | A4 | PROPOSE FIX |  |
| S6-C-N7 | A4 | PROPOSE FIX |  |
| S7-MAJ-16 | A4 | PROPOSE FIX |  |
| S8-IZ-5 | A4 | PROPOSE FIX |  |
| S9-B5 | A4 | PROPOSE FIX |  |
| S6-C-M10 | A5 | PROPOSE FIX |  |
| S9-B6 | A5 | PROPOSE FIX |  |
| S5-M1 | B1 | PROPOSE FIX |  |
| S7-MAJ-03 | B1 | PROPOSE FIX |  |
| S8-IZ-10 | B1 | PROPOSE FIX |  |
| S9-M34 | B1 | PROPOSE FIX |  |
| S6-C-M1 | B2 | PROPOSE FIX |  |
| S6-C-N13 | B2 | PROPOSE FIX |  |
| S7-MAJ-05 | B2 | PROPOSE FIX |  |
| S7-MAJ-33 | B2 | PROPOSE FIX |  |
| S7-NIT-16 | B2 | PROPOSE FIX |  |
| S7-NIT-22 | B2 | PROPOSE FIX |  |
| S9-M13 | B2 | PROPOSE FIX |  |
| S9-M26 | B2 | PROPOSE FIX |  |
| S5-M2 | B3 | PROPOSE FIX |  |
| S7-MAJ-15 | B3 | PROPOSE FIX |  |
| S8-IZ-7 | B3 | PROPOSE FIX |  |
| S5-M11 | B4 | PROPOSE FIX |  |
| S7-MAJ-21 | B4 | PROPOSE FIX |  |
| S8-IZ-9 | B4 | PROPOSE FIX |  |
| S9-M40 | B4 | PROPOSE FIX |  |
| S5-M4 | B5 | PROPOSE FIX |  |
| S6-C-M4 | B5 | PROPOSE FIX |  |
| S6-C-M5 | B5 | PROPOSE FIX |  |
| S7-MAJ-06 | B5 | PROPOSE FIX |  |
| S7-MAJ-12 | B5 | PROPOSE FIX |  |
| S7-MAJ-13 | B5 | PROPOSE FIX |  |
| S7-MAJ-14 | B5 | PROPOSE FIX |  |
| S8-IZ-4 | B5 | PROPOSE FIX |  |
| S9-M14 | B5 | PROPOSE FIX |  |
| S9-M24 | B5 | PROPOSE FIX |  |
| S5-M5 | B6 | PROPOSE FIX |  |
| S5-N8 | B6 | PROPOSE FIX |  |
| S7-NIT-20 | B6 | PROPOSE FIX |  |
| S7-NIT-21 | B6 | PROPOSE FIX |  |
| S8-IZ-6 | B6 | PROPOSE FIX |  |
| S6-C-M7 | B7 | PROPOSE FIX |  |
| S7-MAJ-18 | B8 | PROPOSE FIX |  |
| S7-MAJ-19 | B8 | PROPOSE FIX |  |
| S6-C-N11 | B8 | PROPOSE FIX |  |
| S9-M12 | B8 | PROPOSE FIX |  |
| S9-M25 | B8 | PROPOSE FIX |  |
| S6-C-N12 | B8 | PROPOSE FIX | interim choice recorded as U11 |
| S7-MAJ-10 | B9 | PROPOSE FIX |  |
| S6-C-N4 | B9 | PROPOSE FIX |  |
| S9-M11 | B9 | PROPOSE FIX |  |
| S5-M7 | B10 | PROPOSE FIX |  |
| S6-C-M3 | B10 | PROPOSE FIX |  |
| S8-IZ-14 | B10 | PROPOSE FIX |  |
| S9-M20 | B10 | PROPOSE FIX |  |
| S9-M21 | B10 | PROPOSE FIX |  |
| S8-IZ-16 | B10 | PROPOSE FIX (held) | scope: author decision U1 |
| S6-C-N8 | B11 | PROPOSE FIX | semantics fixed now; removing the setting is U2 |
| S7-MAJ-22 | B11 | PROPOSE FIX | semantics fixed now; removing the setting is U2 |
| S8-IZ-13 | B11 | PROPOSE FIX (held) | scope: author decision U2 |
| S6-C-M11 | B12 | PROPOSE FIX |  |
| S9-M8 | B12 | PROPOSE FIX |  |
| S9-M7 | B7/B12 | PROPOSE FIX | Session Change PATCH and the opened endpoint |
| S6-C-M9 | B12 | PROPOSE FIX | interim: add the endpoint; deleting the feature is U3 |
| S8-IZ-8 | B12 | PROPOSE FIX (held) | scope: author decision U3 |
| S6-C-M2 | B13 | PROPOSE FIX |  |
| S7-MAJ-04 | B13 | PROPOSE FIX |  |
| S9-M32 | B13 | PROPOSE FIX |  |
| S7-MAJ-07 | B14 | PROPOSE FIX |  |
| S7-MAJ-08 | B14 | PROPOSE FIX |  |
| S8-IZ-15 | B14 | PROPOSE FIX |  |
| S9-M19 | B14 | PROPOSE FIX |  |
| S9-M36 | B14 | PROPOSE FIX |  |
| S9-M37 | B14 | PROPOSE FIX |  |
| S9-M42 | B14 | PROPOSE FIX |  |
| S7-MAJ-09 | B15 | PROPOSE FIX |  |
| S6-C-N5 | B16 | PROPOSE FIX |  |
| S6-C-N15 | B16 | PROPOSE FIX |  |
| S6-C-N16 | B16 | PROPOSE FIX |  |
| S9-M1 | B16 | PROPOSE FIX |  |
| S9-M2 | B16 | PROPOSE FIX |  |
| S9-M3 | B16 | PROPOSE FIX |  |
| S9-M4 | B16 | PROPOSE FIX |  |
| S9-M5 | B16 | PROPOSE FIX |  |
| S9-M6 | B16 | PROPOSE FIX |  |
| S9-M16 | B16 | PROPOSE FIX |  |
| S9-M17 | B16 | PROPOSE FIX |  |
| S9-M18 | B16 | PROPOSE FIX |  |
| S9-M27 | B16 | PROPOSE FIX |  |
| S9-M28 | B16 | PROPOSE FIX |  |
| S9-M29 | B16 | PROPOSE FIX |  |
| S9-M30 | B16 | PROPOSE FIX |  |
| S9-M31 | B16 | PROPOSE FIX |  |
| S9-M33 | B16 | PROPOSE FIX |  |
| S9-M35 | B16 | PROPOSE FIX |  |
| S9-M38 | B16 | PROPOSE FIX |  |
| S9-M44 | B16 | PROPOSE FIX |  |
| S6-C-N3 | B17 | PROPOSE FIX | Context7: `advanced.ipAddress.ipAddressHeaders` |
| S7-NIT-17 | B17 | PROPOSE FIX | Context7: `advanced.ipAddress.ipAddressHeaders` |
| S9-M15 | B17 | PROPOSE FIX | Context7: `advanced.ipAddress.ipAddressHeaders` |
| S9-M23 | B18 | PROPOSE FIX |  |
| S7-MAJ-20 | B19 | PROPOSE FIX | interim: accepted risk plus a monthly download; off-Azure copy is U9 |
| S7-NIT-18 | B19 | PROPOSE FIX |  |
| S5-N10 | B19 | PROPOSE FIX |  |
| S7-MAJ-01 | B20 | PROPOSE FIX |  |
| S7-MAJ-02 | B20 | PROPOSE FIX |  |
| S7-MAJ-24 | B20 | PROPOSE FIX |  |
| S7-MAJ-26 | B20 | PROPOSE FIX |  |
| S7-MAJ-27 | B20 | PROPOSE FIX |  |
| S7-MAJ-28 | B20 | PROPOSE FIX |  |
| S7-MAJ-29 | B20 | PROPOSE FIX |  |
| S7-MAJ-30 | B20 | PROPOSE FIX |  |
| S7-MAJ-31 | B20 | PROPOSE FIX |  |
| S7-MAJ-32 | B20 | PROPOSE FIX |  |
| S8-IZ-12 | B20 | PROPOSE FIX |  |
| S6-C-N1 | B20 | PROPOSE FIX |  |
| S5-N5 | B20 | PROPOSE FIX |  |
| S9-M39 | B21 | PROPOSE FIX |  |
| S9-M41 | B21 | PROPOSE FIX |  |
| S9-M43 | B21 | PROPOSE FIX |  |
| S7-NIT-09 | B21 | PROPOSE FIX |  |
| S7-NIT-10 | B21 | PROPOSE FIX |  |
| S5-M8 | B22 | PROPOSE FIX (held) | scope: author decision U4 |
| S8-IZ-1 | B22 | PROPOSE FIX (held) | scope: author decision U4 |
| S8-IZ-11 | B22 | PROPOSE FIX (held) | scope: author decision U4 |
| S9-M22 | B22 | PROPOSE FIX | phase checkpoints are needed whatever U4 decides |
| S5-M9 | B23a | PROPOSE FIX (held) | author decision U5 |
| S5-M10 | B23b | CONTEST | D3 chose REST so scripts and a future app can read; recorded under 'Decisions made while drafting' |
| S5-N1 | B23d | PROPOSE FIX (held) | author decision U8 |
| S5-N2 | B23e | CONTEST | §3: `version` (optimistic lock and Undo guard), `field_set_at` (per-field precedence by sent time) and `entity_version` (history Undo restores from) do three different jobs; none can replace another |
| S5-N3 | B23c | PROPOSE FIX (held) | author decision U7 |
| S5-N4 | B23f | CONTEST | the Detailed Implementation Plan's stated purpose (its first paragraph) is to leave no impactful decisions; Stage 9 asked for more detail, not less |
| S9-M9 | B23 | PROPOSE FIX | DTO conventions added |
| S9-M10 | B23c | PROPOSE FIX | the CONFLICT body now returns the current item, whatever U7 decides |
| S5-N6 | Nit | PROPOSE FIX | part of B5 |
| S5-N7 | Nit | PROPOSE FIX | log before send, with an idempotency key |
| S6-C-N2 | Nit | PROPOSE FIX |  |
| S6-C-N9 | Nit | PROPOSE FIX | rule defined; recorded as U12 |
| S6-C-N10 | Nit | PROPOSE FIX |  |
| S6-C-N14 | Nit | PROPOSE FIX |  |
| S6-C-N17 | Nit | PROPOSE FIX | sentence removed |
| S7-NIT-01 | Nit | PROPOSE FIX |  |
| S7-NIT-02 | Nit | PROPOSE FIX |  |
| S7-NIT-03 | Nit | DECLINE | the EGM template puts these under NFR |
| S7-NIT-04 | Nit | PROPOSE FIX |  |
| S7-NIT-05 | Nit | DECLINE | diagrams are updated where the flow changed |
| S7-NIT-06 | Nit | DECLINE | style only |
| S7-NIT-07 | Nit | PROPOSE FIX | strikethrough replaced with 'Decided' |
| S7-NIT-08 | Nit | DECLINE | the paths are repo-relative and readable |
| S7-NIT-11 | Nit | DECLINE | history kept on purpose |
| S7-NIT-12 | Nit | DECLINE | covered where touched |
| S7-NIT-13 | Nit | PROPOSE FIX | merged with B20 |
| S7-NIT-14 | Nit | PROPOSE FIX | numbers marked as estimates |
| S7-NIT-15 | Nit | DECLINE | style only |
| S7-NIT-19 | Nit | PROPOSE FIX | added to Risks |
| S7-NIT-23 | Nit | PROPOSE FIX | the notice is pinned before M0 stores anything |
| S7-NIT-24 | Nit | PROPOSE FIX |  |
| S7-NIT-25 | Nit | PROPOSE FIX | marked as an estimate |
| S7-NIT-26 | Nit | DECLINE | the glossary is in the repo root |
| S7-NIT-27 | Nit | PROPOSE FIX |  |
| S9-N1 | Nit | PROPOSE FIX |  |
| S9-N2 | Nit | PROPOSE FIX |  |
| S9-N3 | Nit | PROPOSE FIX | shadcn default neutral palette |
| S9-N4 | Nit | PROPOSE FIX |  |
| S9-N5 | Nit | PROPOSE FIX |  |
| S9-N6 | Nit | PROPOSE FIX |  |
| S9-N7 | Nit | PROPOSE FIX |  |
| S9-N8 | Nit | PROPOSE FIX |  |
| S9-N9 | Nit | PROPOSE FIX |  |
| S9-N10 | Nit | PROPOSE FIX |  |
| S9-N11 | Nit | PROPOSE FIX |  |
| S9-N12 | Nit | PROPOSE FIX |  |
| S9-N13 | Nit | PROPOSE FIX |  |
| S9-N14 | Nit | PROPOSE FIX |  |
| S9-N15 | Nit | PROPOSE FIX |  |
| S9-N16 | Nit | PROPOSE FIX |  |
| S9-N17 | Nit | PROPOSE FIX |  |
| S9-N18 | Nit | PROPOSE FIX |  |
| S9-N19 | Nit | PROPOSE FIX |  |
| S9-N20 | Nit | PROPOSE FIX |  |
| S9-N21 | Nit | PROPOSE FIX |  |
| S9-N22 | Nit | PROPOSE FIX |  |
| S9-N23 | Nit | PROPOSE FIX | part of B13 |
| S9-N24 | Nit | PROPOSE FIX |  |
| S8-IZ-17 | Nit | PROPOSE FIX | the one-pass cheap fixes |