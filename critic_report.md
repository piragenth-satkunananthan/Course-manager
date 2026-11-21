# Critic Review Report (Stage 7)

**Target:** `/home/piragenth/Documents/Course-manager/docs/designs/course-manager.md` (lines 1-768; the Detailed Implementation Plan from line 769 is out of scope)
**Mode:** REVIEW
**Standard:** `resources/document_standards/feature-spec-standard.md` (egm-design, egm-structural); persona default audit vectors (egm-style; EGM bundles no separate style standard)
**Baseline context:** CONTEXT.md, GLOSSARY.md, ADR-0001, ADR-0002

## Reviewer Status

| Reviewer | Status | Raw findings (B / M / N) |
| --- | --- | --- |
| `egm-design` | completed | 1 / 17 / 14 |
| `egm-structural` | completed | 0 / 5 / 13 |
| `egm-style` | completed | 0 / 17 / 12 |

After deduplication: **1 Blocker, 33 Major, 27 Nit.**

How findings were merged:
- Where reviewers gave the same issue different severities, the higher one is kept and the difference is noted.
- Line numbers refer to the target file.
- The synthesizer checked the Blocker and the main contradictions (lines 151-159, 213-230, 392, 449-456, 468) against the document text.

## Verdict

The document does not yet pass the feature-spec standard. There are three reasons:
- It has no Risks & Mitigations section (MAJ-01).
- Several rejected alternatives cite only the author, with no linked record (MAJ-02).
- The rule for edited and deleted WhatsApp messages can silently lose a Deadline or a correction in a common situation (BLK-01).

---

## Blocker

### BLK-01. An edited message, or a delete followed by a repost, can silently remove a Deadline or drop the correction
- **Reviewer(s):** egm-design
- **Location:** §9 "Edited and deleted messages" (L449-452); §3 Undo rule (L228); "most recently sent wins" rule (L230); `suppression` (L215)
- **Failure scenario:**
  1. **The edit loses.** A message "Lab 4 due Friday" creates an Assignment. That sets `field_set_at.due_date` to the message's `sent_at`. The item is then touched (for example, the Student edits it), so Undo of the original change is blocked. The sender edits the message to "Lab 4 due Thursday". L451 reprocesses the edit "with the original `sent_at`". L230 writes a field only when `sent_at` is strictly *later* than `field_set_at`, and here the two are equal. The correction is dropped and the Final Reminder fires a day late.
  2. **The item is deleted and stays deleted.** If Undo is allowed, undoing the create sets `deleted_at` and adds a `suppression` keyed on title and due date (L228, L215). The edited text keeps the same due date, so the suppression is active. The validator skips the re-create (L445), and the AI also sees the suppression in its context. The Assignment is gone and no reminders are sent.
  3. **Delete and repost.** A Class Representative deletes a message and reposts a corrected one. This takes the same path as case 2.
  4. **Undo of an update.** The document does not say whether Undo restores the earlier `field_set_at` values or stamps the current time. If it stamps the current time, every reprocessed edit loses.
- **Suggested fix:**
  - Treat an edit as a new message whose `sent_at` is the edit timestamp, sent through normal matching, instead of undoing and replaying it.
  - Undo triggered by the system (edit or delete) must not create suppressions. Record it with `actor = system`.
  - State that Undo restores the earlier `field_set_at` values.
  - Add these cases to the §13 Undo and precedence truth table.

---

## Major

### MAJ-01. There is no Risks & Mitigations section
- **Reviewer(s):** egm-structural, egm-design
- **Location:** Whole document. Required by the standard ("Risks & Limits").
- **Failure scenario:**
  - Risks are spread across The Problem (L24), §9 (L456), §10, §12, the NFRs and Alternatives C/P/S.
  - Several have no mitigation or recovery plan anywhere:
    - WhatsApp bans the Student's *personal* number. The only measure is "never sends" (L384). Nothing covers what the Student loses or how they recover.
    - A WhatsApp protocol change breaks the pinned Baileys version (L536). There is no upgrade runbook.
    - NVIDIA retires the pinned NIM model or ends the free tier. This is only an Open Question (L48), and "No-go goes back to the author" (L597) is not a mitigation.
    - The email provider suspends the account, has an outage, or its mail goes to spam (see MAJ-21).
    - The B1s allowance or the $100 credit runs out. This appears only in Future Improvements (L765).
  - A reader cannot confirm the standard's pass test, "all major risks have been addressed".
- **Suggested fix:** Add `## Risks & Mitigations` between Alternatives Considered and Non-Functional Requirements. Use a table with columns for risk, likelihood, impact, detection, mitigation and remaining risk. Link each existing mitigation to its section.

### MAJ-02. Rejected alternatives cite the author with no linked record, and two restate the decision instead of giving a trade-off
- **Reviewer(s):** egm-structural, egm-design
- **Location:** Alternatives Considered intro (L607); Alternatives B-H, J-L, O, T (L615-727)
- **Failure scenario:**
  - The standard's Alternatives Rule forbids crediting a rejection to a maintainer without linking the issue, discussion or PR. It also requires a concrete trade-off.
  - Several entries say "Rejected by author" with no link.
  - E ("Every sender counts equally for now") and L ("REST under `/api/v1` was chosen") restate the decision without a trade-off.
  - A and N follow neither labelling convention that L607 defines.
  - A reviewer cannot check the reasoning, and the document fails a mandatory check.
  - C, M and N (cite ADRs) and J/K/L (point to D1-D3) are acceptable on the linking point.
- **Suggested fix:**
  - Link each "Rejected by author" to a specific section of `concepts_brief.md` or to an ADR.
  - Move the trade-off from each Cons line into the Reason line. For E, missed announcements versus noise. For L, a stable contract versus extra code.
  - Label A and N under the convention.

### MAJ-03. A failed NIM startup check also stops reminders
- **Reviewer(s):** egm-design, egm-structural
- **Location:** §10 Worker (L466, L468); §1 component table (L146)
- **Failure scenario:**
  - L466 says each loop catches its own errors so "a crash in one loop does not stop the others".
  - L468 makes the worker *exit* at startup if the pinned NIM model is not listed.
  - Suppose NVIDIA retires the model mid-semester, or the model-list endpoint is rate-limited. The worker enters a restart loop. The scheduler shares the process, so no Daily Digests or Final Reminders go out, and the feature behind G1 stops.
  - Each restart also reconnects to WhatsApp, which adds churn on a number at risk of a ban.
- **Suggested fix:** Make "model listed" fail only the `ai` health signal. Keep the scheduler and the WhatsApp loop running. Exit at startup only when the database is unreachable or the encryption key does not load.

### MAJ-04. The memory budget contradicts itself and M0 cannot check it
- **Reviewer(s):** egm-structural, egm-style, egm-design
- **Location:** §1 memory budget (L151-159); §15 go/no-go (L591); G5 (L32); Alternatives P and S (L703, L721)
- **Failure scenario:**
  - M0 passes the worker at up to 300 MB of steady memory (L591), but M1 caps the worker container at 256 MB (L157). Suppose M0 measures 280 MB and declares "go". In production the out-of-memory killer then kills the worker repeatedly, and it reconnects to WhatsApp each time.
  - The limits add up to about 902 MB under a heading that promises "at most 750 MB steady state", with no explanation.
  - M0 runs no web app or Postgres, so it cannot measure the 750 MB total that Alternatives P and S rely on. The first real measurement comes after M1 is built.
  - "OS + Docker about 150 MB" is low for Ubuntu 24.04 plus dockerd, containerd and the Azure agent.
- **Suggested fix:**
  - Set the M0 worker threshold below the M1 limit, for example "at most 200 MB (below its 256 MB limit in §1)".
  - Label the table as per-container hard limits, and state that their sum exceeds 750 MB on purpose. G5 is checked against measured steady-state use.
  - Have M0 also run Postgres with the §1 settings and an empty Next.js standalone app, so the total can be measured.

### MAJ-05. G2 promises reminders the design deliberately does not send, and the reminder rules are described three ways
- **Reviewer(s):** egm-structural, egm-style
- **Location:** Overview (L11); The Problem item 2 (L22); G2 (L29); Deadline definition (L217); §8 Daily Digest (L398); §7 settings (L344)
- **Failure scenario:**
  - G2 says "Every Deadline produces two reminders". L217 says an Exam with a date but no time gets no Final Reminder.
  - A Deadline that is added after 07:00 and due before the next 07:00 is in no digest.
  - G2 fixes the digest at "07:00 Asia/Colombo", but the time zone can be changed in settings.
  - L11 says the student is emailed "once in a morning digest". CUJ 1 shows three digests. L22 says "next 2 days", while G2 says "that day or the next 2 days".
  - When G2 is measured at the end of the semester, these cases count as failures. Alternatively, an implementer adds special-case sends to meet the goal as written.
- **Suggested fix:** Rewrite G2 with the exceptions spelled out and "07:00 in the Student's time zone". Align L11 and L22 with that wording, for example "in the morning digests for the 2 days before it is due".

### MAJ-06. G3's 15-minute limit cannot be met under the retry plan
- **Reviewer(s):** egm-style
- **Location:** G3 (L30); §8 retries (L392); NFR "Announcements" (L742)
- **Failure scenario:**
  - The NFR budget counts "up to 5 minutes of batching plus the NIM call". It leaves out the 60-second tick, and NIM retries wait 1, 5, 15 and 60 minutes.
  - Any NIM outage therefore counts as a G3 failure, even though G4 is the goal meant to cover it.
- **Suggested fix:** Add "when the first NIM call succeeds. Retries can delay this; G4 covers delays over 1 hour." Include the tick in the NFR budget.

### MAJ-07. The accuracy gate is worded differently in G3 and in the rest of the document
- **Reviewer(s):** egm-style
- **Location:** G3 (L30), compared with §13 (L545), §15 (L594) and CONTEXT.md L96
- **Failure scenario:**
  - G3 says "at least 95% on everything else". The other three places say "at least 95% overall".
  - "Overall" includes deadline messages and "everything else" excludes them, so the same M0 run can pass under one wording and fail under the other.
- **Suggested fix:** Use "at least 95% overall" in G3.

### MAJ-08. M0 tunes the prompt and grades it on the same roughly 50 messages
- **Reviewer(s):** egm-design (egm-style raised the token estimate as a Nit)
- **Location:** G3 (L30-31); §13 AI evaluation (L545); §15 test set (L583-595); NFR token estimate (L744)
- **Failure scenario:**
  - The prompt is changed until it passes on the same messages, so passing says little about new messages.
  - Perhaps 10-20 of them are deadline messages. 100% on that few is weak evidence for applying AI changes without review.
  - One week of traffic may contain no edits, deletions or extensions.
  - The token estimate ("tens of thousands to a few hundred thousand a day") has no stated basis.
- **Suggested fix:**
  - Split the set into a tuning part and a held-out part, and score the gate on the held-out part.
  - Add synthetic cases for categories that did not occur during the week.
  - Base the token figure on the measured size of each call's context.

### MAJ-09. G1's measure does not measure a Missed Deadline
- **Reviewer(s):** egm-style
- **Location:** G1 (L28)
- **Failure scenario:**
  - GLOSSARY.md defines a Missed Deadline as not submitted by the true due time.
  - G1 compares the due time with the app's Submitted time, which records when the Student clicked, not when the work was handed in.
  - A late click counts as a miss. Work handed in late but marked Submitted before the due time does not.
- **Suggested fix:** Measure from the Student's own count of Assignments handed in late or not at all, cross-checked against Submitted times, plus the list of items that never reached the app.

### MAJ-10. A status change may block Undo of a wrong AI change
- **Reviewer(s):** egm-design, egm-style
- **Location:** `assignment` rules (L213); Undo rule (L228); `entity_version` "one row for every write, by anyone" (L223); `PUT /assignments/:id/status` (L334)
- **Failure scenario:**
  - L213 says a status change "never counts as an edit for Undo purposes". But L228 allows Undo only when `version == after_version`, and L223 implies every write adds a version.
  - Suppose the AI sets a wrong due date and the Student then marks the item "In progress". If that increments `version`, Undo is disabled and the wrong date stays.
- **Suggested fix:** State that status writes do not increment `version` and write no `entity_version` row. Alternatively, state that the Undo rule ignores versions where only status changed.

### MAJ-11. Messages left in `processing` after a crash are never retried, and health checks cannot see them
- **Reviewer(s):** egm-design
- **Location:** `inbox_message.status` (L239); Idempotency (L469-474); `ai` signal (L480)
- **Failure scenario:**
  - The worker is the out-of-memory killer's first target (L151), so a crash in the middle of a batch is likely.
  - Rows left in `processing` are not `pending`, so the `ai` signal stays healthy. Nothing resets them.
  - Those announcements are lost and no alert is sent.
- **Suggested fix:** At startup, and after a timeout, reset `processing` rows older than N minutes to `pending`. Count stale `processing` rows in the `ai` health rule.

### MAJ-12. Messages marked `dead` cannot be recovered, and the Possibly Missed check skips them
- **Reviewer(s):** egm-design
- **Location:** §8 retries (L391-393); Possibly missed (L454); §7 API (L287-349)
- **Failure scenario:**
  - A NIM outage, or a used-up daily quota, lasting longer than about 81 minutes (1+5+15+60) marks the messages `dead` for good.
  - The Student sees "3 messages could not be processed", but no endpoint lets them retry.
  - The keyword check runs only on `ignored`/`question` decisions, so a dead deadline message is never flagged.
- **Suggested fix:**
  - Add `POST /api/v1/inbox/retry-dead`, or retry dead messages automatically once NIM is healthy again.
  - Run the keyword check on dead and errored messages, and show them with the "Add Assignment" / "Add Exam" buttons.

### MAJ-13. The NIM retry count does not add up
- **Reviewer(s):** egm-style (Major), egm-structural (Nit), egm-design (Nit)
- **Location:** §8 "NIM failures" (L392)
- **Failure scenario:** Four delays (1, 5, 15, 60 min) give five attempts, but the text marks messages dead "After the 6th failure". An implementer has to guess what happens between the 5th and 6th failures.
- **Suggested fix:** "If the 5th attempt fails, the messages are marked `dead`…", or add a fifth delay.

### MAJ-14. Correct AI output that fails validation is thrown away, and nothing can apply it later
- **Reviewer(s):** egm-design
- **Location:** §9 validation rules 3 and 5 (L440, L444); retry once (L393)
- **Failure scenario:**
  - **More than 10 operations.** A Class Representative posts the dates for 12 lab sheets in one message, so the whole batch is rejected.
  - **Assignment after the Semester ends.** A final project due during study leave is rejected. The 60-day allowance covers Exams only.
  - **Extension in the same batch.** "Semester extended to 15 Jan; report due 10 Jan" fails, because operations are checked against the old end date before `extend_semester` applies.
  - In each case the output is "rejected and logged" and cannot be applied later.
- **Suggested fix:**
  - Store rejected operations, as `unknown_course_mention.pending_ops` already does, and add an "Apply anyway" action.
  - Allow Assignments a window after the Semester's end.
  - Validate the batch after applying `extend_semester`.

### MAJ-15. When the AI cancels a Deadline, no email says so
- **Reviewer(s):** egm-design
- **Location:** §9 risk highlighting (L447); Prompt injection (L456); Daily Digest content (L398)
- **Failure scenario:**
  - A classmate jokes "Lab 4 cancelled lol". The AI soft-deletes the Assignment and its reminder is cancelled.
  - The digest lists only Deadlines that were created or changed, and a cancelled item is no longer a Deadline.
  - The only signal is a highlight on the dashboard, but the Student relies on Gmail.
- **Suggested fix:** Add a "Removed since the last digest" section to the digest, with an Undo link. Consider an immediate email when a `cancelled`-risk change hits a Deadline due within 7 days.

### MAJ-16. The single combined heartbeat gives false alerts and then hides real ones
- **Reviewer(s):** egm-design
- **Location:** §10 health signals and heartbeat (L475-489); `auto_changes_paused` (L195)
- **Failure scenario:**
  - While Auto Changes are paused, pending messages pass 30 minutes and the `ai` signal fails. The heartbeat stops and healthchecks.io reports an outage. For the rest of the pause, a real VM outage produces no new alert.
  - The `wa_socket` signal checks only "connected". A socket that stays connected but receives or decrypts nothing stays green.
- **Suggested fix:**
  - Treat "paused" as healthy for `ai`.
  - Use one healthchecks.io check per signal.
  - Add a staleness rule, for example no message from any linked group in 24 hours on a teaching weekday.

### MAJ-17. Claims about WhatsApp message intake are unverified, and M0 does not test them
- **Reviewer(s):** egm-design
- **Location:** Data flow (L167); §8 socket configuration, "Never sends" and Disconnects (L383-386); CUJ 7 (L95); M0 (L576-580)
- **Failure scenario:**
  - In CUJ 7 the Student pairs first and links groups afterwards, so at first every group is ignored.
  - If encryption key messages are dropped while a group is ignored, later messages may not decrypt once the group is linked. Baileys may then send retry receipts, which conflicts with "never sends".
  - These cases are unspecified:
    - what happens to messages that cannot be decrypted;
    - whether messages sent during a restart are delivered when the worker reconnects;
    - messages that arrive in the gap of up to 60 s before `linkedGroupJids` reloads.
- **Suggested fix:**
  - Add M0 checks: pair, then link a group and confirm the next messages decrypt; restart the worker and confirm messages sent during the downtime arrive.
  - Store undecryptable messages as `kind = other` with a reason, and count them in health.
  - Reload the group list when the link request arrives.

### MAJ-18. Submitted Assignments are left out of the AI context, so a repeated announcement creates a duplicate
- **Reviewer(s):** egm-design
- **Location:** §9 context, "open Assignments and Exams" (L408); conflicts with CONTEXT.md L65
- **Failure scenario:** The Student submits Lab 4 early. The lecturer posts "Reminder: Lab 4 due tomorrow". The AI sees no Lab 4 and creates a new to-do Assignment, which triggers false reminders and an Overdue entry.
- **Suggested fix:** Include recently submitted items (for example, due within ±30 days) with their status in the context.

### MAJ-19. Repeat mentions of an Unknown Course may lose their pending operations
- **Reviewer(s):** egm-design
- **Location:** `unknown_course_mention` (L226); CUJ 5 (L80-84)
- **Failure scenario:** The row is unique on `(student_id, name_key)` and has one `first_message_id`. "DSA quiz Monday" and then "DSA assignment due Friday" both arrive before the Student resolves the first. Nothing says the second message's operations are appended, so "Add as Nickname" may create only the quiz.
- **Suggested fix:** Append to `pending_ops`, keep a list of source messages, state this rule, and test it.

### MAJ-20. Backups are in the same Azure subscription as the VM
- **Reviewer(s):** egm-design
- **Location:** §14 Backups (L563-569); G5 (L32); Future Improvements (L765)
- **Failure scenario:** The credit, the 12-month period or the Student's eligibility lapses, and Azure disables the subscription. The VM and the Blob backups become unavailable together, so nothing can be restored to the AWS fallback.
- **Suggested fix:** Keep a second copy outside the subscription (a weekly download, or another provider's free storage). Add an alert for the credit or expiry date.

### MAJ-21. G2 counts emails sent, not emails delivered
- **Reviewer(s):** egm-design
- **Location:** G2 (L29); `email_log` (L247); `email` signal (L482)
- **Failure scenario:** The provider accepts each message but Gmail files it as spam. Every health signal and G2 pass while the Student sees nothing.
- **Suggested fix:**
  - Record the provider's delivery and bounce webhooks.
  - Test Gmail inbox placement in M0.
  - Have the Student add a "never send to spam" filter.
  - Measure G2 against delivered emails.

### MAJ-22. Changing the time zone moves every stored deadline
- **Reviewer(s):** egm-design
- **Location:** §3 conventions (L192); `PATCH /settings {timeZone}` (L344); §11 (L507)
- **Failure scenario:** Due times are wall-clock values read in the Student's time zone. The Student travels and sets Europe/London. A 23:59 Colombo deadline becomes 23:59 London, and the Final Reminder fires after the real deadline.
- **Suggested fix:** Store the zone on the Semester (the university's zone) and use the Student's zone only for display. Alternatively, remove the time zone setting from M1.

### MAJ-23. The Activity Log gives the wrong reason when a deleted message's change is kept
- **Reviewer(s):** egm-style
- **Location:** §9 "A delete" (L452)
- **Failure scenario:** "Otherwise" covers two cases: other source messages still exist, or the item was edited. The fixed text "change kept because the item was edited since" is wrong in the first case and misleads the Student.
- **Suggested fix:** Log the reason that actually applied, for example "…because other messages still support it" or "…because the item was edited since".

### MAJ-24. "The worst a malicious message can do" claims too much
- **Reviewer(s):** egm-style
- **Location:** §9 Prompt injection (L456)
- **Failure scenario:**
  - The cap is 10 operations *per batch*, so messages spread over several batches can cause more changes.
  - Injected text can also fill the Unknown Course and Possibly Missed entries.
  - Readers will take this as an upper bound when it is not one.
- **Suggested fix:** "A malicious message can cause at most 10 changes per batch, and only changes that pass validation."

### MAJ-25. "A crash at any point can be retried without creating duplicates" is too broad
- **Reviewer(s):** egm-style, egm-design (N5)
- **Location:** §10 Idempotency (L469-474); §8 scheduler (L397-398)
- **Failure scenario:** The worker crashes after the email provider accepts a send but before `sent_at` or `email_log` is written. The next tick sends the email again. The listed guarantees cover database rows only.
- **Suggested fix:** Pass the provider's idempotency key (reminder id or digest date). Otherwise, narrow the claim to say that a crash between the send and the log write can send that email twice.

### MAJ-26. "Rollback is always safe" claims too much
- **Reviewer(s):** egm-style
- **Location:** §14 (L562); NFR Rollout (L748)
- **Failure scenario:** Expand-then-contract keeps the old columns. It does not stop new code from writing values the old code rejects, such as a new enum value or `op` kind. "Always" removes the reason to check this.
- **Suggested fix:** "…as long as new code writes no values the old code rejects." Make the same change at L748.

### MAJ-27. "Library behaviour quoted here was checked" covers more than the list it gives
- **Reviewer(s):** egm-style
- **Location:** Technical Plan intro (L108)
- **Failure scenario:** The sentence covers all library behaviour, but lists seven options. Other claims are not on the list and will be read as verified:
  - `revokeSessionsOnPasswordReset` (L273)
  - "as the Better Auth docs recommend" (L274)
  - the trusted-proxy header (L275)
  - `requestPairingCode` (L385)
  - "the docs mark as a demo" (L237)
  - Baileys `logout` (L530)
- **Suggested fix:** Say that only the listed options were checked (through Context7 on 2026-11-20) and that the rest is checked during implementation. Alternatively, add the missing items to the list.

### MAJ-28. Unverified items are scattered through the body instead of listed in Open Questions
- **Reviewer(s):** egm-style
- **Location:**
  - L488 (healthchecks.io free plan "assumed; to be verified")
  - L509
  - L536
  - L720 (B2ats/B2pts eligibility "unverified")
  - L743 ("a target, not measured yet")
- **Failure scenario:** The healthchecks.io plan is part of the G4 alert path, and Alternative S is the named fallback if M0 fails. Neither is in Open Questions, so nobody is assigned to resolve them before M1.
- **Suggested fix:**
  - Move the healthchecks.io plan and the VM eligibility into Open Questions, each marked "Resolved by M0".
  - For L743, name a measurement method or drop the target.

### MAJ-29. Open Questions lists items the document already answers
- **Reviewer(s):** egm-style (Major), egm-structural (Nit)
- **Location:** Open Questions (L49, L50) compared with L108 and L776
- **Failure scenario:**
  - L50 asks whether a linked session stops phone notifications, but L108 says the Baileys README confirms that `markOnlineOnConnect: true` does.
  - L49 asks which email provider to use, but L776 names Resend.
  - The reader cannot tell what M0 still has to resolve.
- **Suggested fix:**
  - Narrow L50 to "whether notifications still reach the phone with `markOnlineOnConnect: false`".
  - Mark L49 resolved, or narrow it to the free-tier and deliverability check.

### MAJ-30. Review-process labels a new reader cannot look up
- **Reviewer(s):** egm-style (Major), egm-structural (Nit), egm-design (Nit)
- **Location:**
  - "the reviewers' concern (C5)" (L108)
  - "reviewer finding F1" (L569)
  - "the Goldfish review" (L607)
  - "seven-lens Goldfish review" (L757)
  - "(from the reviewers; unverified)" (L660)
  - "The Student and Claude pick" (L583)
  - "Context7" (L108, L509, L536, L758)
- **Failure scenario:** C5 and F1 are defined nowhere, and "Goldfish", "Claude" and "Context7" are not explained. A reader cannot trace the reasoning.
- **Suggested fix:**
  - State each concern inline. For L108: "…stops notifications from reaching the phone, so the setting in §8 is required". For L569: "…because restored signal keys are stale".
  - Explain Context7 once, as a documentation lookup service.
  - Keep the Goldfish references only in Additional Resources, with a one-line definition.

### MAJ-31. ADR-0001 has no "priced resource list"
- **Reviewer(s):** egm-style (Major), egm-structural (Nit)
- **Location:** Open Questions, "Azure costs" (L51)
- **Failure scenario:** A reader opens ADR-0001 to find the list and finds nothing. The list is a planned change (L1388).
- **Suggested fix:** "These are added to ADR-0001 as a priced resource list once checked (see Implementation Plan)."

### MAJ-32. "M2 only adds tables" is inaccurate, because `session_group_id` cannot be a foreign key in M1
- **Reviewer(s):** egm-structural (Nit), egm-design (Nit). Raised to Major here because it changes the migration plan.
- **Location:** §3 (L250)
- **Failure scenario:** The `session_group` table does not exist in M1, so the foreign-key constraint cannot be created. M2 needs an `ALTER`, which contradicts "M2 only adds tables".
- **Suggested fix:** Call it "a nullable uuid column; the foreign-key constraint is added in M2".

### MAJ-33. CUJ 1 leaves out the digest the new Assignment first appears in
- **Reviewer(s):** egm-structural (Nit). Raised to Major here because CUJ 1 is the acceptance path for G2.
- **Location:** CUJ 1 (L60), compared with §8 Daily Digest (L398) and CONTEXT.md L51
- **Failure scenario:** Under L398, the 10 Nov digest lists the Assignment as "created since the last digest". CUJ 1 lists only 18, 19 and 20 Nov. A test written from CUJ 1 would fail the correct behaviour, or would encode the wrong one.
- **Suggested fix:** Add the 10 Nov digest to CUJ 1's Then clause.

---

## Nit

### NIT-01. Server Actions wording left over after D3 chose REST
- **Reviewer(s):** egm-structural, egm-style, egm-design
- **Location:**
  - `getLinkStatus` (L385)
  - "page and action code" (L282)
  - "result shape (§7)" (L462)
  - "forms and actions" (L524)
- **Failure scenario:** An implementer builds a Server Action for link status alongside `GET /api/v1/whatsapp`.
- **Suggested fix:** Use "the web app polls `GET /api/v1/whatsapp`", "route-handler code", "the error body (§7)" and "forms and route handlers".

### NIT-02. Wrong section references
- **Reviewer(s):** egm-structural, egm-design, egm-style
- **Location:**
  - L236 "encrypted (see §8)": encryption is covered in §12 and D2.
  - L236 "`*_requested_at` … (§8)": §8 does not describe how the worker checks these columns.
  - L285 "It is rejected in Alternatives": Alternative Q says "Not chosen in drafting".
- **Failure scenario:** A reader follows a reference and does not find what it promises.
- **Suggested fix:**
  - Point L236 to §12.
  - Add one sentence to §8 on how often the worker checks the request columns.
  - Change L285 to "It was not chosen; see Alternative Q".

### NIT-03. Additional Resources and Future Improvements sit under Non-Functional Requirements
- **Reviewer(s):** egm-structural
- **Location:** L752, L760
- **Failure scenario:** A generated table of contents lists them as NFR subsections.
- **Suggested fix:** Promote both to H2.

### NIT-04. The Course deletion rule contradicts itself and hides that a hard delete unlinks a group
- **Reviewer(s):** egm-structural, egm-design
- **Location:** §4 (L267); `wa_group` (L238)
- **Failure scenario:** "Deleting or archiving a Course is a soft action" is followed by "A hard delete requires typing the Course code". A hard delete also unlinks the Course Group, after which that group's messages are silently dropped.
- **Suggested fix:** "Archiving is soft. Deleting is a hard delete that requires typing the Course code, cascades to …, and unlinks its Course Group." Show the unlink in the confirmation.

### NIT-05. The diagrams are incomplete
- **Reviewer(s):** egm-structural
- **Location:** §1 (L114-138); §4 (L254-265)
- **Failure scenario:**
  - In §1, the Heartbeat service has no arrow from the worker or from the backup script.
  - In §4, `assessment 1───1 reminder` is wrong for untimed Exams (it should be 0..1).
  - §4 also leaves out `suppression`, `unknown_course_mention`, `email_log`, `health_signal` and the `ai_batch`-`inbox_message` link.
- **Suggested fix:** Add the missing arrows and tables, and correct the cardinality.

### NIT-06. Mixed bullet markers
- **Reviewer(s):** egm-structural
- **Location:** `*   ` in Goals through Alternatives, `- ` in the Technical Plan, and both in the NFR list (L733-750)
- **Failure scenario:** Inconsistent rendering and noisy diffs.
- **Suggested fix:** Use one marker.

### NIT-07. Strikethrough on decisions that are in force
- **Reviewer(s):** egm-structural, egm-style
- **Location:** D1-D3 (L601-603)
- **Failure scenario:** `~~D1…~~` reads as "withdrawn".
- **Suggested fix:** Remove the strikethrough and keep "Decided by author".

### NIT-08. References are code spans, not links
- **Reviewer(s):** egm-structural
- **Location:** Mentions of `CONTEXT.md`, the ADRs and `concepts_brief.md` throughout
- **Failure scenario:** The paths are relative to the repo root but the document is in `docs/designs/`, so none can be clicked.
- **Suggested fix:** Use Markdown links with correct relative paths, for example `../../CONTEXT.md`.

### NIT-09. "student", "Student", "author" and "product owner" are mixed
- **Reviewer(s):** egm-style
- **Location:** L11, L17, L21, L38, L39, L58, L106, L601-607, L628 and §3/§6/§9
- **Failure scenario:**
  - L13 says capitalised terms follow the glossary, but both cases name the same person.
  - L607 implies a second drafter who is never named.
- **Suggested fix:** State once in the Overview that the product owner is the Student and the author of "Decided by author" items, and that an AI assistant did the drafting. Then use "the Student" throughout.

### NIT-10. Glossary terms in the wrong case or with a different meaning
- **Reviewer(s):** egm-style
- **Location:**
  - "occurrence" (L102, L207)
  - "Possibly missed" (L337, L454)
  - "Trusted Senders" (L633)
  - "missed deadlines" (L545)
- **Failure scenario:** A reader cannot tell which uses are defined terms.
- **Suggested fix:**
  - Write "Occurrence" and "Possibly Missed".
  - Write "trusted senders" in lowercase, since it is not a glossary term.
  - Change L545 to "deadline messages the AI failed to act on".

### NIT-11. Outdated history and unneeded justification
- **Reviewer(s):** egm-style
- **Location:** D1 (L601) "It supersedes CONTEXT.md's 'thrown away' rule…"; L230 "…which matches the meaning of 'later message'"; CUJ 3 (L70) "wrongly moved an Exam to the wrong day"
- **Failure scenario:** The extra words add nothing for the reader.
- **Suggested fix:** Delete the D1 sentence, delete the L230 clause, and change CUJ 3 to "An Auto Change moved an Exam to the wrong day".

### NIT-12. Vague phrases
- **Reviewer(s):** egm-style
- **Location:**
  - "an Undo that keeps working" (L24)
  - "The single source of truth." (L147)
  - "One place for the basics" (G6, L33)
  - "It expires when…" (L215)
- **Failure scenario:** None of these says what the design actually guarantees.
- **Suggested fix:**
  - L24: "an Undo rule based on version numbers".
  - L147: "Holds all state; Postgres tables are the queue".
  - G6: "Core records are editable on phone and desktop".
  - L215: "It stops applying when a new announcement gives a different due date".

### NIT-13. Smaller claims that go further than the design supports
- **Reviewer(s):** egm-style
- **Location:** L454, L495, L592, L629, L715, L717
- **Failure scenario:**
  - L454 "catches messages the AI dismissed", although "cancel" and "postpone" are not deadline words.
  - L495 "support comes from the components".
  - L592 "no unexplained logouts" cannot be measured.
  - L629 "No wrong date ever reaches the dashboard".
  - L715 "the same guarantees".
  - L717 heading "A second free VM".
- **Suggested fix:**
  - L454: "flags dismissed messages that contain these words" and "deadline or change word".
  - L495: "the components provide keyboard and screen-reader behaviour, which page code must not break".
  - L592: "no logouts other than ones caused on purpose".
  - L629: "No unreviewed date…".
  - L715: name the specific guarantees.
  - L717: "A second VM".

### NIT-14. Numbers with no stated source
- **Reviewer(s):** egm-style
- **Location:** L536 "forks have been reported to steal sessions"; L701 "about 150 MB saved"; L765 "a dated move-or-pay decision" (no date given)
- **Failure scenario:** The figures cannot be checked.
- **Suggested fix:**
  - L536: cite a source, or write "malicious look-alike packages are a known npm risk".
  - L701: say which figure the 150 MB comes from.
  - L765: give a date, for example "before month 11 of the B1s allowance".

### NIT-15. Problems in the examples and formatting
- **Reviewer(s):** egm-style
- **Location:**
  - CUJ 2 (L65): "Thursday 4.30" resolves to 19 Nov only by inference.
  - CUJ 7 (L95): leaves out linking the Class Group to the Semester.
  - L473: a whitespace-only line inside a list.
  - Alternative O (L696): quotes "attendance and files", which are M2/M3 features.
- **Failure scenario:** The examples are ambiguous or out of scope.
- **Suggested fix:**
  - CUJ 2: "Thursday the 19th, 4.30".
  - CUJ 7: add "and the Class Group to the Semester".
  - Remove the blank line at L473.
  - Alternative O: "Drops the web app's timetable, Course pages and Activity Log".

### NIT-16. When a digest is skipped is not recorded, so a mid-afternoon digest is possible
- **Reviewer(s):** egm-design
- **Location:** §8 Daily Digest (L398)
- **Failure scenario:** The 07:00 digest is skipped because nothing was due, and nothing records that. At 15:00 a Deadline is added, the rule "no digest exists for today" is still true, and a digest goes out mid-afternoon.
- **Suggested fix:** Record skipped digests, or state that a mid-afternoon digest is intended.

### NIT-17. The proxy header claim relies on the wrong control
- **Reviewer(s):** egm-design
- **Location:** §5 (L275)
- **Failure scenario:** "Better Auth trusts the header only from the Caddy container" is probably not a library feature. The actual control is that `web`'s port is not published.
- **Suggested fix:** Say that.

### NIT-18. The pre-deploy dump is unencrypted on the VM
- **Reviewer(s):** egm-design
- **Location:** §14 (L556)
- **Failure scenario:** A plain `pg_dump` containing message text and WhatsApp keys sits on disk, with no retention rule.
- **Suggested fix:** Encrypt it the same way as the nightly backup, and delete it after a successful deploy.

### NIT-19. SSH exposure for deploys
- **Reviewer(s):** egm-design
- **Location:** §12 (L514); §14 (L555)
- **Failure scenario:** Port 22 is open to the internet for GitHub Actions, and the deploy key reaches a VM that holds the WhatsApp keys.
- **Suggested fix:** Restrict the source addresses, or deploy with `az vm run-command`.

### NIT-20. Cancel and reschedule operations are not checked against a real occurrence
- **Reviewer(s):** egm-design
- **Location:** §9 validation (L436-442)
- **Failure scenario:** `cancel_occurrence` or `reschedule_occurrence` can name a date on which the Class Session does not meet.
- **Suggested fix:** Validate that the date is a real occurrence of that session.

### NIT-21. Suppression is undefined for Exams with a TBA date
- **Reviewer(s):** egm-design
- **Location:** `suppression` (L215)
- **Failure scenario:** The suppression key includes `due_date`, which is null for a TBA Exam. It is unclear whether such a suppression matches anything.
- **Suggested fix:** Define the behaviour when the date is null.

### NIT-22. G2's 99% target cannot be measured meaningfully
- **Reviewer(s):** egm-design
- **Location:** G2 (L29)
- **Failure scenario:** At 2-10 emails a day, one late email in a short window moves the figure by several percent.
- **Suggested fix:** Use a count, for example "no more than N late reminders per semester", or state the measurement window.

### NIT-23. M0 stores classmates' messages before the notice is pinned
- **Reviewer(s):** egm-design
- **Location:** §15 (L582); CONTEXT.md L73
- **Failure scenario:** M0 stores message text from classmates before the notice that CONTEXT.md requires has been pinned in the groups.
- **Suggested fix:** Pin the notice before M0 starts.

### NIT-24. The advisory lock is not tied to a dedicated connection
- **Reviewer(s):** egm-design
- **Location:** §8 (L375)
- **Failure scenario:** The lock is taken on a pooled connection that gets recycled. A second worker then acquires the lock while the first still holds a WhatsApp socket, and WhatsApp closes one of the two connections.
- **Suggested fix:** Hold the lock on a dedicated connection outside the pool, and exit if that connection drops.

### NIT-25. The token estimate has no basis
- **Reviewer(s):** egm-style, egm-design (see MAJ-08)
- **Location:** NFR (L744)
- **Failure scenario:** "Tens of thousands to a few hundred thousand tokens a day" cannot be checked against NIM limits.
- **Suggested fix:** State the calculation: tokens per batch times batches per day.

### NIT-26. "Occurrence" and other capitalised terms have no glossary link
- **Reviewer(s):** egm-style (folded from N2)
- **Location:** L13
- **Failure scenario:** L13 refers readers to `GLOSSARY.md`, but the reference is not a link (see NIT-08).
- **Suggested fix:** Make it a relative link.

### NIT-27. The `ai_batch` to `inbox_message` relationship is not stated in §4
- **Reviewer(s):** egm-structural (folded from item 14)
- **Location:** §4 (L252-267)
- **Failure scenario:** Rolling back a whole batch (L240) depends on `inbox_message.batch_id`, but §4 does not describe that link.
- **Suggested fix:** Add one line describing the relationship.

---

## Not checked

- The reviewers did not verify external facts against current documentation: Baileys behaviour (`shouldIgnoreJid` timing, encryption keys for groups linked after pairing, offline delivery), NIM free-tier terms, Better Auth options, Azure pricing and healthchecks.io plans. BLK-01, MAJ-17 and MAJ-27 depend on some of these and should be confirmed in M0.
- `concepts_brief.md` and `CLAUDE.md` were not given to the reviewers. Some C5/F1 labels or rejection reasons may already be recorded there, which would change the fix for MAJ-02 and MAJ-30 to "add the link".
