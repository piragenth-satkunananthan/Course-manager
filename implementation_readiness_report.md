# Goldfish Review Report: Stage 9 (Implementation Readiness Test)

**Target:** `/home/piragenth/Documents/Course-manager/docs/designs/course-manager.md` (lines 769-1426, "Detailed Implementation Plan")
**Standard:** `resources/document_standards/implementation-readiness-standard.md` (implementation-readiness, codebase-details). The style reviewer's persona names no default standard, so it reviewed for terminology, ambiguity and consistency against the same standard.

**Verdict:** NOT READY. All three reviewers fail the plan on the Zero-Decision Rule.

## Reviewer Status

| Reviewer | Status | Notes |
| --- | --- | --- |
| `egm-implementation-readiness` | completed | The first run failed on a network error (ENOTFOUND). It was retried once, and the retry completed. |
| `egm-codebase-details` | completed | No Context7 or web access. Library-API claims marked **(verify)** come from the reviewer's own knowledge. |
| `egm-style` | completed | |

Reviewer short names used below: **IR** = implementation-readiness, **CD** = codebase-details, **ST** = style.

## Severity Breakdown (after deduplication)

| Severity | Count |
| --- | --- |
| Blocker | 6 |
| Major | 40 |
| Nit | 24 |

---

## Blockers

### B1. Edits and deletes from WhatsApp cannot be stored or found
* **Reviewers:** IR (B3), CD (B1), ST (B2, M16), CD (M20)
* **Lines:** 1184-1189 (mainly 1186, 1188, 1189)
* **Failure scenario:** `inbox_message` is unique on `(student_id, wa_group_id, wa_message_id)` (§3, line 239), and Baileys reports an edit under the original message's id. So the edit row from line 1188 hits `ON CONFLICT DO NOTHING` and is silently dropped, and the correction never reaches the AI. For deletes, line 1189 says "mark it so the processor handles it", but no column or status exists for that mark. The original is already `done`, so the batcher never sees it, and resetting it to `pending` would send a deleted message to the AI as new text. The plan also never names the Baileys event or field that carries edits and deletes. A generic "non-text, so `kind=other`" branch can swallow them first.
* **Fix:**
  - Define the edit row's key, for example `wa_message_id = '<origId>:edit:<editTimestamp>'`. Say that the latest edit wins.
  - Add an explicit delete state, for example `revoke_pending`, that `edits.ts` processes without calling NIM. If the original row is missing, do nothing and log it.
  - Give a classification order (edit, then delete, then text, then other) and name the Baileys field for each, for example `protocolMessage.type === MESSAGE_EDIT` or `REVOKE`. **(verify)**
  - Add an integration test where an edit creates a second row.

### B2. Batch claiming, transaction boundaries and crash replay contradict §10
* **Reviewers:** IR (B2), ST (B1), CD (M19)
* **Lines:** 1195, 1208, 1249-1250
* **Failure scenario:** Line 1208 applies each operation in its own transaction and *then* marks the messages done. §10 (line 471) says the operation and its message-status update commit together. Line 1250 tests "a crash between apply and mark-done is replayed", a gap that exists only under the line 1208 design. A replay calls NIM again, which isn't deterministic, so the "no duplicate" outcome can't be made to pass reliably. Line 1195 doesn't say whether the 60-second NIM call runs inside the `FOR UPDATE SKIP LOCKED` transaction, or whether rows move to `processing` first. If they move to `processing` and the worker crashes, nothing resets them, so they stay stuck forever. Line 1249 says the messages are "still marked" without saying marked as what.
* **Fix:**
  - Pick one boundary and state it. Recommended: each operation's writes, its `auto_change` row and its messages' `status`/`decision` update commit in one transaction, and messages with no operation are marked in a final transaction.
  - Define the state machine `pending -> processing (commit, claimed_at lease) -> done | failed | dead`, with stale `processing` rows reclaimed on startup or after N minutes.
  - Store the validated output on `ai_batch` (for example `output jsonb`), and replay that stored output instead of calling NIM again. Add an idempotency key per operation, for example a unique `(batch_id, op_index)` on `auto_change`.
  - Rewrite lines 1249-1250 to assert each message's exact expected status and that a replay creates no duplicate.

### B3. An edited message can never apply its correction
* **Reviewers:** IR (B1)
* **Lines:** 945, 948, 1209
* **Failure scenario:** "Lab 4 due Fri" creates an Assignment, then the sender edits it to "due Thu". `edits.ts` undoes the original first.
  - If the original was a create, `undoPlan` soft-deletes it and inserts a `suppression` (line 948). When the title and due date still match (say only the description changed), the suppression silently skips the re-processed create.
  - If it was an update, nothing says which `field_set_at` the Undo writes. If it writes "now", the edit is re-processed with the original, older `sent_at`, so `planFieldUpdate` drops every field and the correction is lost.
* **Fix:** In lines 948 and 1209, state that:
  - Undo restores `field_set_at` from the `before` snapshot, so `entity_version.before` must carry `field_set_at`.
  - An Undo of a create that an edit triggers inserts no suppression.
  - The edit is re-processed only after the Undo commits, with the original `sent_at`.

### B4. Accepting only `notify` upserts drops messages that arrived while the worker was down (verify)
* **Reviewers:** CD (B2)
* **Lines:** 1184
* **Failure scenario:** After a reconnect, Baileys delivers the server's offline queue with `type: 'append'`, not `'notify'`. **(verify against the pinned Baileys version)** Every deploy (line 1308 stops the worker), crash restart or reconnect backoff then loses the announcements posted in that window, which hits goal G1 directly.
* **Fix:** Accept both `notify` and `append` from linked groups and let the unique key dedupe. History sync is off, so `append` brings in no back-history. Add a fixture flagged as offline to file 71.

### B5. Nothing writes `health_signal(backup)`, so the worker heartbeat stops permanently
* **Reviewers:** IR (B4), CD (M16), ST (M27)
* **Lines:** 1217, 1318-1320
* **Failure scenario:** `health.ts` pings healthchecks.io only when *every* signal is healthy, and §10 (line 483) includes `backup`, which the backup script is meant to write. File 79 only pings `HEALTHCHECK_BACKUP_URL`. About 26 hours after deploy the worker heartbeat stops for good, and healthchecks.io keeps emailing "down", which hides real outages. A fresh install, before its first backup, is also undefined.
* **Fix:**
  - Pick one option and state it:
    - Add a step to `backup.sh` that upserts `health_signal(component='backup', last_ok_at=now())` through `docker compose exec -T postgres psql`.
    - Or remove `backup` from the signals the worker evaluates, since the separate backup check already covers it.
  - Treat a missing backup row as healthy for the first 26 hours.

### B6. No storage exists for most Activity Log entries or for alert causes
* **Reviewers:** CD (B3, M35), IR (M7), ST (M24)
* **Lines:** 900-908, 1063, 1207-1208, 1218
* **Failure scenario:**
  - File 46 merges "rejected AI output" and "alerts" into the feed, and §8/§9 add more Activity Log entries: messages that could not be processed, an exceeded operation cap, skipped suppressions, and "message deleted, change kept". None of these has a table in file 17. `validate.ts` returns `rejected[]`, but `apply.ts` never says where those are saved.
  - The limit of one alert per cause every 12 hours (line 1218) needs a cause column, and `email_log` has none.
  - Cursor pagination across five sources has no defined cursor.

  The implementer would have to design both the schema and the pagination.
* **Fix:**
  - Add `activity_event(id, student_id, kind, batch_id?, inbox_message_id?, payload jsonb, created_at)` to §3 and file 17, and name the module that writes each kind.
  - Add `email_log.alert_cause` with an index on `(student_id, alert_cause, sent_at)`.
  - Define the feed cursor as `(created_at, id)`.

---

## Major

### M1. Library versions are left to the implementer
* **Reviewers:** CD (M1)
* **Lines:** 771, 775
* **Failure scenario:** "Latest stable at implementation time" lets breaking major versions decide the code:
  - Next 15 vs 16: `middleware.ts` became `proxy.ts`, and route `params` became a Promise.
  - zod 3 vs 4: `z.toJSONSchema` exists only in 4.
  - Tailwind 3 vs 4: v4 needs `@tailwindcss/postcss` and has no config file.
  - Baileys 6 vs 7: v7 is ESM-only and uses LID addressing.

  Node 22 leaves LTS in April 2027.
* **Fix:** Pin the major version of every dependency in the plan. Choose Node 24 LTS, or justify Node 22.

### M2. The production images can't run `migrate` or `create-student`, and `disableSignUp` blocks account creation
* **Reviewers:** IR (M3, M4), CD (M2, M10)
* **Lines:** 835-836, 982, 1224, 1281, 1285 (and §5 line 271)
* **Failure scenario:**
  - `db:migrate` presumably uses drizzle-kit, which is a dev dependency and isn't in the bundled worker image.
  - `create-student` is a `.ts` file run by tsx (also a dev dependency) through the `web` image. That image holds only the standalone `server.js`.
  - With `disableSignUp: true`, Better Auth's sign-up API also rejects the call. **(verify)**

  Both commands fail on the VM.
* **Fix:**
  - Add a migrate entry point that uses `migrate()` from `drizzle-orm/node-postgres/migrator`, bundled as `dist/migrate.js`. The `migrate` service runs `node dist/migrate.js`.
  - Bundle `create-student` into the worker image.
  - Name the exact Better Auth mechanism: `auth.$context` with `password.hash` and `internalAdapter.createUser`/`createAccount`, or the admin plugin's `createUser`.
  - Update §5 and line 1281 to match, and give each npm script's exact command in file 5.

### M3. The worker bundler is undecided
* **Reviewers:** IR (M5), CD (M3), ST (M11)
* **Lines:** 835-836, 1279, 1410
* **Failure scenario:** "tsx or esbuild" leaves a tool choice open, and tsx doesn't bundle. esbuild isn't a dependency, and no npm script builds the worker, yet line 1410 verifies "the worker bundle". Baileys' optional native dependencies need to be external.
* **Fix:**
  - Choose esbuild and add it to the dev dependencies.
  - Add a `build:worker` script and give its exact command: entry points, `--platform=node`, the format, the `@/*` alias, and externals or `--packages=external` plus how `node_modules` gets into the image.
  - Reference that script at line 1410.

### M4. A per-request CSP nonce can't be set in `next.config.ts`
* **Reviewers:** IR (M2), CD (M4), ST (Nit on line 870)
* **Lines:** 870, 1119
* **Failure scenario:** `headers()` in next.config is static. A nonce needs `src/middleware.ts` (Next 15 and earlier) or `src/proxy.ts` (Next 16), and neither file is in the plan. Line 870 also leaves it unclear whether Caddy or Next owns HSTS.
* **Fix:** Add the middleware or proxy file (Create) and put the CSP directives there. Keep only static headers in next.config, and name a single HSTS owner.

### M5. Files the plan needs are missing from the file list
* **Reviewers:** CD (M5), IR (Nit 10), ST (M32)
* **Lines:** 796-1406 (file list), 836
* **Failure scenario:** A write allowlist built from this list would block all of these:
  - `src/lib/auth-client.ts`, the Better Auth client used by file 54
  - `src/lib/utils.ts` (`cn()`, created by shadcn)
  - the middleware or proxy file from M4
  - the migrate entry point from M2
  - a Postgres init script that creates the test database, since the official image creates only `POSTGRES_DB`
  - `.dockerignore`
  - `next-env.d.ts`
  - an npm script that runs `scripts/seed-dev.ts`, which the end-to-end tests rely on
* **Fix:** Add each file with Create. Add a `db:seed` script and call it from the Playwright setup.

### M6. The lint allowlist forbids database imports the plan requires
* **Reviewers:** CD (B4, raised as Blocker), IR (M1)
* **Lines:** 849 (against 916, 981, 1001, 1091)
* **Failure scenario:** Three planned files are outside the allowed paths but need `@/server/db/client`: `src/server/auth.ts` (Drizzle adapter), `src/server/email/resend.ts` (writes `email_log`) and `src/app/api/health/route.ts` (`select 1`). CI lint fails. §8 line 363 ("data/ is the only importer") contradicts line 849 as well.
* **Fix:** Either add the three paths to the allowlist, or move the `email_log` write and the health query into `src/server/data/` and allowlist only `auth.ts`. Make §8 line 363 match.

### M7. Endpoints are missing for functions the plan defines, and CONFLICT is misused
* **Reviewers:** IR (M10), CD (M7), ST (M14)
* **Lines:** 1038, 1067, 1093-1107, 1114
* **Failure scenario:**
  - `markOpened` has no route, so highlighted changes can never be cleared.
  - Line 1038 tells the UI to "edit the existing change", but no PATCH exists for `session-changes/[id]`.
  - CONFLICT means a version mismatch, so line 1114 would open the wrong (version-conflict) dialog for a duplicate Session Change.
* **Fix:** Add `POST /api/v1/auto-changes/[id]/opened` and `PATCH /api/v1/session-changes/[id]` (with `expectedVersion`), their schemas, and an updated route count (31). Or use a distinct error code such as `DUPLICATE_SESSION_CHANGE` and say exactly what the UI does.

### M8. Screens and components that M1 requires are missing
* **Reviewers:** ST (M29), CD (M6)
* **Lines:** 1125-1150
* **Failure scenario:** CUJ 7 starts with "creates the current Semester", but there is no page or form to create, set current or archive a Semester. Also missing:
  - a Nickname editor
  - the "Undo batch" control
  - a settings form with the pause switch
  - the delete-account dialog

  The first-run flow can't be completed from the UI.
* **Fix:** Add `(app)/semesters/page.tsx` (or a Settings section), plus `semester-form`, `nickname-editor`, `settings-form`, `delete-account-dialog` and an undo-batch control. Name the hosting page for each and update the counts.

### M9. API response shapes are not defined
* **Reviewers:** IR (M8)
* **Lines:** 966-970
* **Failure scenario:** §7 returns "Semester", "Course", `overdue[]`, `banners[]` and activity items without field lists or a date/time format (local strings or ISO instants). Exam bodies are only "same pattern". The implementer would be designing the API contract.
* **Fix:** Add a DTO table per resource: field names, types, nullability, and the date/time serialization.

### M10. The conflict dialog can't work with the defined error body
* **Reviewers:** IR (M9), ST (Nits on 1114 and 1150)
* **Lines:** 966, 1114, 1150
* **Failure scenario:** `{error:{code,message,fieldErrors?,requestId}}` has no slot for the current version or values. The side-by-side view and "re-apply mine" both need them, and §7 says the body includes the current version. It is also unclear whether `apiFetch` opens the dialog itself, and who "theirs" is.
* **Fix:** Add `current?: {version, entity}` to the CONFLICT body. Say that `apiFetch` returns the error and the caller opens the dialog. Say that "re-apply mine" resubmits with the new `expectedVersion`.

### M11. How AI operations map to `writeEntity` is unspecified, including no-op writes and creates
* **Reviewers:** IR (M11), CD (M21), ST (M21)
* **Lines:** 945, 1016-1022, 1208
* **Failure scenario:**
  - When `planFieldUpdate` drops every field, the plan still bumps the version and writes `entity_version` and `auto_change`. That no-op blocks Undo of the previous real change.
  - Step 1, "load FOR UPDATE", has no row to load on a create.
  - It is unclear who inserts `auto_change` and `auto_change_source`, whether Student edits go through `field_set_at`, and how a message's `decision` is recorded when its operation was rejected.
  - Undo of an AI-created Session Change or Semester extension is undefined, because `suppression` only models assessments.
  - The `risk` rule and the summary format are undefined.
* **Fix:**
  - Add a per-`op` table in file 64/`apply.ts`: target entity, create or update, `risk` rule, summary format and Undo behaviour.
  - Add a create branch to `writeEntity` and the rule "empty plan: no write, no `auto_change`, return `noop`" (plus a test).
  - State that the Student actor bypasses `field_set_at`.

### M12. Resolving an Unknown Course is underspecified
* **Reviewers:** IR (M12), CD (M24)
* **Lines:** 1066
* **Failure scenario:** "applies `pending_ops`" leaves these undecided:
  - which code path runs it, given that `apply.ts` is worker code called from the web data layer
  - whether `validate.ts` re-runs, with possibly stale ids
  - which `setAt` and `batch_id` to use
  - whether `auto_change` rows are written, so the result can be undone
  - which Semester the "add" option uses
  - what is stored for the Nickname
  - what a second mention of the same name does to `pending_ops`
* **Fix:** Say that resolving fills in `courseId`, re-runs `validate.ts`, and applies through the shared `apply` function (moved under `src/server/`) with `actor=ai`, `setAt` = the source messages' `sent_at`, and full `auto_change` rows. Define the Semester, the Nickname source, and whether repeat mentions append or overwrite.

### M13. Digest sending can double-send or send mid-day
* **Reviewers:** IR (M13), CD (M17), ST (M22)
* **Lines:** 956, 1001, 1216, 1252
* **Failure scenario:**
  - A day with nothing to list writes no row, so a Deadline added at 15:00 triggers a 15:00 digest.
  - Line 1216 sends *before* claiming the `digest_date` row, so two concurrent ticks both email, which fails the line 1252 test.
  - `sendEmail` also writes `email_log`, so there are two writers. `changesSinceLastDigest` is undefined: which rows count, whether the Student's own edits count, and what the first digest covers.
* **Fix:**
  - Claim first: `INSERT email_log(kind='digest', digest_date, status='sending') ON CONFLICT DO NOTHING`, then send, then update the status. Record empty days as `skipped`.
  - Let `sendEmail` update an existing row by id.
  - Define the change query, the dedupe rule and the retry behaviour after a failed send.

### M14. The AI retry policy is incomplete and contradicts §8
* **Reviewers:** IR (M14), CD (Nit on 1206)
* **Lines:** 1206-1207
* **Failure scenario:** "429 or 5xx to a retry" gives no schedule. §8 lists four delays but says messages go dead "after the 6th failure". Timeouts and malformed JSON are not classified, and the one-time validation re-prompt from §9 is missing.
* **Fix:** State the delays and the maximum number of attempts, which columns are updated (`attempts`, `next_attempt_at`), how each error type is classified, and the single re-prompt that includes the validation error.

### M15. Rate limits contradict §5, and the client IP isn't configured
* **Reviewers:** IR (M15), CD (M11), ST (M13)
* **Lines:** 983-984
* **Failure scenario:** `/request-password-reset` allows 3 here but 5 in §5 (line 275), and `/reset-password` has no rule at all. Without `advanced.ipAddress` configured to trust `X-Forwarded-For` only from Caddy, every request appears to come from Caddy's IP, so one attacker can lock out the Student. Nothing says `web` publishes no host ports.
* **Fix:** Settle on one number and change §5 to match. List every limited path. Add the `advanced.ipAddress` settings, and state "web: no `ports:`" in file 75.

### M16. `.env.example` is not "every environment variable"
* **Reviewers:** IR (M16), CD (M13), ST (M9)
* **Lines:** 858-866
* **Failure scenario:** These variables are missing:
  - `DATABASE_URL_TEST`, `IMAGE_TAG` and `APP_HOST`
  - `BACKUP_AGE_RECIPIENT` and `BACKUP_SAS_URL`
  - the Postgres container's user, password and database
  - the `NODE_OPTIONS` heap settings
  - the M0 spike's key variable
  - the GHCR owner
* **Fix:** List them all, say which program reads each one, and say whether each lives in the VM `.env`, CI or the host only.

### M17. The backup script uploads to a malformed URL and runs at the wrong time
* **Reviewers:** IR (M17), CD (M16, Nit on 1322), ST (Nit on 1322)
* **Lines:** 1318-1322
* **Failure scenario:**
  - `$BACKUP_SAS_URL/<date>.dump.age` puts the blob name after the SAS query string.
  - Azure Put Blob needs a Content-Length, so a chunked upload from a pipe fails. **(verify)**
  - `pg_dump` has no `-U` or database name.
  - "02:00 Asia/Colombo" on a UTC VM runs at the wrong time unless a time zone is set.
* **Fix:**
  - Split the variable into a container URL and a SAS token.
  - Write to a temp file, then run `curl --upload-file f "$URL/<date>.dump.age?$SAS"`.
  - Give the exact `pg_dump` arguments.
  - Write the cron line as `30 20 * * *` (UTC), and install `age` during provisioning.

### M18. Nothing says how deploy files reach the VM
* **Reviewers:** IR (M18), CD (M15)
* **Lines:** 1302-1313, 1334, 1340-1348
* **Failure scenario:**
  - The VM only pulls images, but `deploy.sh`, `compose.yaml`, `Caddyfile`, `backup.sh` and `crontab` must exist in `/opt/course-manager`, and no step copies them there.
  - `IMAGE_TAG` is lost on a later `compose up` unless it is written to `.env`.
  - Step 7 doesn't say how it queries `health_signal`, which user runs compose, or how `known_hosts` is pinned.
* **Fix:** Add an scp/rsync step to `deploy.yml` (or a `git checkout <sha>` on the VM). Write `IMAGE_TAG` into `.env`. Give the exact `psql` query for step 7, the user that runs compose, and the host-key pinning.

### M19. The AI evaluation case format is undefined, and `context.ts` is tied to the database
* **Reviewers:** IR (M19), CD (M31)
* **Lines:** 818, 1196, 1229-1231, 1258-1265
* **Failure scenario:** `nim-eval`, `ai-eval`, the synthetic cases and the private cases must share a format that is never given. That format needs the thread, "now", fixture entities, the expected operations, a deadline flag and an id mapping. `ai-eval` runs "the real `context.ts`", which queries Postgres in production.
* **Fix:** Add a case schema, for example `tests/ai-eval/case.schema.ts`. Split `context.ts` into a pure `buildContext(snapshot)` and a database `loadSnapshot(tx, ...)`.

### M20. The worker's lock, identity and polling are unclear
* **Reviewers:** IR (M20), CD (M26), ST (M15)
* **Lines:** 916, 1071, 1157-1158, 1171
* **Failure scenario:**
  - A session advisory lock taken through the 5-connection pool is silently released when the pooled connection idles out.
  - It is undefined how the worker learns `studentId` and who creates the `wa_session` row.
  - The WhatsApp loop has no stated poll interval, and "straight away" (line 1171) contradicts the 60-second bound.
  - The worker can't know to poll every 2 seconds until it has already seen the pairing request.
* **Fix:**
  - Hold the lock on a dedicated `pg.Client` and exit if that client errors.
  - Say who creates `wa_session` and when `studentId` is read.
  - State the polling: the WhatsApp loop polls the single `wa_session` row every 2 seconds, or every 2 seconds while `pairing` and 60 seconds otherwise. Drop "straight away".

### M21. The pairing flow is incomplete
* **Reviewers:** CD (M28), IR (M20)
* **Lines:** 1175
* **Failure scenario:** These are all undefined:
  - closing an existing socket before a re-link
  - the phone format (digits only, no `+`)
  - when `requestPairingCode` may be called (after the socket starts connecting)
  - code or QR expiry and the pairing timeout
  - the `restartRequired` reconnect right after pairing
  - the clear error at the linked-device limit that CONTEXT.md requires
* **Fix:**
  - Make `socket.ts` the only owner of the socket.
  - Spell out the pairing state machine, including a timeout of about 3 minutes that sets `status=error` with a readable `last_error`.

### M22. No per-phase checkpoints, and files aren't mapped to phases
* **Reviewers:** IR (M21)
* **Lines:** 781-794
* **Failure scenario:** No phase has exit criteria. File 35 (email) is needed in phase 5 but grouped with phase 8, and file 68 is needed by phase 7. CI added in phase 2 fails with no tests: Vitest exits 1, Playwright has no specs, and coverage thresholds apply to empty folders.
* **Fix:** Add a table mapping each phase to its files and exit command. Use `passWithNoTests`, and switch on thresholds and end-to-end tests in the phase that adds them.

### M23. Account deletion sends its confirmation after the needed data is gone
* **Reviewers:** IR (M6), CD (M22), ST (M23)
* **Lines:** 1077-1081, 1001, 1003
* **Failure scenario:**
  - After the cascade delete, the email address is gone and the `email_log` insert violates its foreign key. There is also no account-deleted template or email kind.
  - No worker file handles `unlink_requested_at`, and the web app has nothing to poll during its 30-second wait.
  - A worker that never logged out stays connected with in-memory credentials.
* **Fix:**
  - Read the address first, and send with no log row or a nullable `student_id`. Add the template and kind.
  - Make `socket.ts` handle unlink: `logout()`, wipe the auth rows, set `status=unlinked`, clear the request.
  - Have the web app poll for `status='unlinked'`, and have the worker close its socket when `wa_session` disappears.

### M24. Pausing Auto Changes triggers a false outage alert
* **Reviewers:** CD (M18), ST (M17), IR (Nit 6)
* **Lines:** 1195, 1217
* **Failure scenario:** While paused, pending messages age past 30 minutes, so the `ai` signal fails (§10 line 480). The heartbeat stops, and healthchecks.io emails "down". The backlog behaviour after un-pausing is also undefined.
* **Fix:** Exempt paused time from the `ai` health rule. State whether the backlog is applied after un-pausing or marked ignored.

### M25. The prompt's time rules hard-code a zone and are circular
* **Reviewers:** ST (M18), IR (Nit 5)
* **Lines:** 1201-1202
* **Failure scenario:** "Asia/Colombo" is hard-coded, but `user.time_zone` can be edited. The "4.30" rule depends on knowing whether something is in the afternoon, and "kept as written" isn't a valid `LocalTime` (HH:mm).
* **Fix:** Use the Student's time zone. Give a concrete rule, for example "1.00-7.59 with no am/pm means 13:00-19:59; 8.00-12.59 means as written".

### M26. Edge cases for date-only Exams and reminders are open
* **Reviewers:** ST (M19, M20), IR (Nits 2, 3), CD (M34)
* **Lines:** 938-940, 952, 1076
* **Failure scenario:**
  - `effectiveDueInstant` returns null for an Exam that has a date but no time, which conflicts with §3 (it's still a Deadline in the Digest). It is also unclear whether such an Exam counts as TBA.
  - `finalReminderSendAt` is undefined once the due instant has passed.
  - `shouldCancel` misses an Exam that becomes TBA.
  - Changing the time zone never recomputes `reminder.send_at`.
* **Fix:**
  - Return null only when the date is null, and add a `hasTime` flag. Define `tbaExams` as Exams with a null date.
  - Return null when the due instant has passed, and have the caller cancel the reminder.
  - Recompute reminders whenever the settings update changes the time zone.

### M27. The test setup contradicts itself
* **Reviewers:** IR (Nit 1), CD (M32), ST (M10, M25, M26)
* **Lines:** 880, 886, 1241, 1243, 1296, 1328
* **Failure scenario:**
  - `setup.test.ts` (line 1243) would run as a test, not as the global setup named `setup.ts` (line 880).
  - The `ingest` unit test needs a database, but the unit project has none.
  - Line 1296 says CI uses `compose.dev.yaml`, but line 1328 says CI uses a service container.
  - No test covers `socket.ts`, even though the disconnect fixtures exist.
* **Fix:**
  - Rename the file to `setup.ts` and drop it from the test list.
  - Split ingest into a pure `mapBaileysEvent()` (unit-tested) and the inserts (integration-tested).
  - Pick one Postgres source for CI, and add a socket disconnect-reason test.

### M28. The end-to-end setup is underspecified and will hit rate limits
* **Reviewers:** CD (M33), ST (M32)
* **Lines:** 886, 1235
* **Failure scenario:** Four specs on two projects means 8 sign-ins from 127.0.0.1, which exceeds 5 per minute and returns 429 errors. The test Student's creation isn't defined (`create-student` is interactive). `npm run start` with `output: "standalone"` isn't the supported command, and §13 says end-to-end tests run against compose.
* **Fix:** Sign in once per project and reuse the session with `storageState`, or add a test-only flag that disables the limiter. Have `seed-dev` create the user without prompting. Pick one server command.

### M29. `EMAIL_API_BASE_URL` probably won't reach the Resend SDK (verify)
* **Reviewers:** CD (M12)
* **Lines:** 863, 1001, 1273
* **Failure scenario:** The `resend` SDK reads its base URL from `RESEND_BASE_URL` and has no constructor option for it. **(verify)** End-to-end tests would then email the real API instead of `fake-resend.ts`.
* **Fix:** Use `RESEND_BASE_URL`, or have `resend.ts` call `fetch` directly against `${EMAIL_API_BASE_URL}/emails`.

### M30. Wrong premise that drizzle-kit can't express partial indexes or checks
* **Reviewers:** CD (M8), ST (Nit on 912)
* **Lines:** 912
* **Failure scenario:** Hand edits to `0000_init.sql` aren't in the `drizzle/meta` snapshots, so later `db:generate` runs drift from them. Current drizzle supports `uniqueIndex().where(...)`, expression indexes and `check()`. **(verify)**
* **Fix:** Declare every index and constraint in `schema.ts`, list them by name, and forbid hand-editing generated SQL.

### M31. The `student_id` type doesn't match Better Auth's user id
* **Reviewers:** CD (M9)
* **Lines:** 901, 908, 981
* **Failure scenario:** §3 says every primary key is a uuid, but Better Auth's `user.id` is `text` by default. Every foreign key must match it, so the implementer has to guess.
* **Fix:** Either configure uuid generation in Better Auth (**verify** the option), or use `student_id text` everywhere. Say whether the auth tables come from `@better-auth/cli generate`.

### M32. Compose settings are inconsistent with the memory budget
* **Reviewers:** CD (M14, Nit on 1290), IR (Nit 9), ST (Nit on 1290)
* **Lines:** 1285-1292
* **Failure scenario:**
  - `restart: unless-stopped` on the one-shot `migrate` service restarts it forever.
  - The `--max-old-space-size` flags from §1 aren't placed anywhere.
  - M0 allows the worker 300 MB but its `mem_limit` is 256 MB.
  - The health checks have no commands, and the images likely lack curl.
* **Fix:**
  - Set `migrate` to `restart: "no"`, and set `NODE_OPTIONS` per service.
  - Align the M0 criterion with the memory limit.
  - Give each service's health-check command, for example `node -e "fetch(...)"` for web.

### M33. A hard-deleted Course leaves orphan rows
* **Reviewers:** CD (M23)
* **Lines:** 1030
* **Failure scenario:** `reminder`, `entity_version` and `auto_change` refer to entities by `(entity_type, entity_id)` with no foreign key. `wa_group.linked_course_id`, `suppression.course_id` and `session_change.course_id` have no `ON DELETE` action, so the delete either fails or leaves orphans.
* **Fix:** Specify each foreign key's action, for example `SET NULL` for `linked_course_id`. Make `courses.ts` delete the polymorphic rows explicitly.

### M34. A failed NIM startup check takes WhatsApp down with it
* **Reviewers:** CD (M25)
* **Lines:** 1157
* **Failure scenario:** If NIM is down or the model is retired, the worker exits and crash-loops. The WhatsApp Link stays offline, and messages from that time are lost because there is no look-back.
* **Fix:** Treat a NIM failure as a failing `ai` signal plus an alert. Exit only on database or key failures.

### M35. How the Baileys auth store serialises its data is unspecified (verify)
* **Reviewers:** CD (M27)
* **Lines:** 1163, 1169
* **Failure scenario:** The credentials hold Buffers and protobuf objects, which plain JSON corrupts, breaking the link after a restart.
* **Fix:** Specify:
  - `BufferJSON.replacer`/`reviver`
  - `initAuthCreds()` when no row exists
  - persisting on `creds.update`
  - reviving `app-state-sync-key` from protobuf
  - wrapping with `makeCacheableSignalKeyStore`
  - deleting the `wa_auth_key` rows on wipe

### M36. The M0 spike can't detect decryption failures in groups linked later
* **Reviewers:** CD (M29)
* **Lines:** 808
* **Failure scenario:** `shouldIgnoreJid` drops unlinked groups' sender-key messages, so the first messages in a newly linked group may fail to decrypt. The spike watches a fixed set of groups and never tests this. The predicate as written also ignores the Student's own JID, which carries protocol messages from their other devices.
* **Fix:** Add an M0 check that links a group mid-run and confirms its messages decrypt. Decide whether the own JID must stay unignored.

### M37. The M0 spikes have no dependency setup and could leak WhatsApp keys into git
* **Reviewers:** CD (M30)
* **Lines:** 798-813, 854
* **Failure scenario:** The spikes run in phase 1, before `package.json` exists, and `tsconfig` excludes them. A Baileys auth folder outside `spikes/m0/data/` would be committed to the repository.
* **Fix:** Add `spikes/m0/package.json` (Create). Require the auth folder to sit under `spikes/m0/data/`, and name the spike's key variable.

### M38. Dependency list gaps
* **Reviewers:** CD (M36), ST (M12), IR (Nit 8)
* **Lines:** 834
* **Failure scenario:**
  - "The official Baileys package" names nothing, and both `baileys` and `@whiskeysockets/baileys` exist.
  - No QR renderer is listed, though Baileys gives only a raw QR string.
  - "shadcn/ui peer dependencies" is vague, and `@tailwindcss/postcss` and `@types/*` are missing.

  The standard bans unlisted dependencies, so the implementer is stuck.
* **Fix:** Name every package: `@whiskeysockets/baileys`, a QR library, class-variance-authority, clsx, tailwind-merge, lucide-react, the radix packages, tw-animate-css, `@tailwindcss/postcss` and the `@types` packages.

### M39. Wording drifts from GLOSSARY.md
* **Reviewers:** ST (M1-M5, Nits on 1007, 1063, 1369, 1422)
* **Lines:** 827, 1016, 1080, 1150, 1224, 1369, 1422 ("user", "account", "author", "student"); 1146, 1202 ("class"); 930-933, 1038, 1051, 1058, 1147 ("occurrence" in lower case); 932 ("off-days"); 820 ("missed deadline operations"); 1369 ("The reminders are the Daily Digest...")
* **Failure scenario:** Terms the glossary lists under "Avoid", or terms with a fixed glossary meaning, let a reader confuse:
  - the Resend account owner with the Student
  - a "Class" with a Course or Class Session
  - the AI scorer's misses with the product's Missed Deadline metric
  - the Daily Digest with a Reminder

  "Leaves a hook to skip off-days" (line 932) doesn't say what form the hook takes.
* **Fix:**
  - Use Student, Class Session, Occurrence, Final Reminder and Missed Deadlines as GLOSSARY.md defines them. Write `user` in backticks when it means the table.
  - Line 932: "accepts an optional `offDays` parameter (Break Weeks and Holidays), always empty in M1".
  - Line 820: "expected deadline operations the model left out".

### M40. The Resend test sender's limit is misdescribed
* **Reviewers:** ST (M1)
* **Lines:** 776
* **Failure scenario:** Resend's test sender delivers only to the email address registered on the Resend account. "The account owner's own address" is ambiguous, so an implementer could register Resend with a different address and the Student would get no email.
* **Fix:** "Resend's test sender, which only delivers to the address registered on the Resend account; register the Resend account with the Student's Gmail."

### M41. Files 91 and 92 list changes that are already done, and the Activity Log definition is now too narrow
* **Reviewers:** ST (M6, M7), CD (Nits on 1402, 1404), IR (Nit 10)
* **Lines:** 1063, 1400-1406
* **Failure scenario:** Every GLOSSARY change file 91 lists is already in the repo. File 92 "Create"s the document under review, which already exists. Both sit on the write allowlist and invite needless edits. Meanwhile GLOSSARY defines the Activity Log as "the Student's list of Auto Changes", but line 1063 also puts Unknown Courses, Possibly Missed messages, rejected output and alerts in it.
* **Fix:** Drop file 92, or mark it Modify. Reduce file 91 to the one remaining edit: broaden the Activity Log definition.

### M42. Group 1 says `docs/m0-report.md` is thrown away
* **Reviewers:** ST (M8)
* **Lines:** 798, 825
* **Failure scenario:** "Throwaway, deleted after M0" covers file 4, but lines 1398 and 1416 depend on that report staying.
* **Fix:** Move file 4 out of Group 1, or say that only `spikes/m0/` is deleted.

### M43. Change instruction for ADR-0001 quotes a phrase that isn't in it
* **Reviewers:** ST (M28)
* **Lines:** 1387
* **Failure scenario:** ADR-0001 never says "free services only". It says "hosted within the Azure for Students free services" and "the only free option". An implementer searching for the quoted phrase won't find what to change.
* **Fix:** Quote the actual sentences from ADR-0001.

### M44. Globs are used where the exact file names are known
* **Reviewers:** ST (M30)
* **Lines:** 771, 1093, 1254, 1258
* **Failure scenario:** Line 771 claims every file is listed, but files 51, 71 and 72 are globs. The standard allows globs only for generated output, so the write allowlist and the ticket split stay vague.
* **Fix:** List the route files in full, and name each fixture and evaluation case file, for example `relative-date.json`.

---

## Nits

| ID | Reviewers | Lines | Issue | Fix |
| --- | --- | --- | --- | --- |
| N1 | ST | 813 | "Proves:" overstates what a spike does. | Use "Measures:". |
| N2 | ST, CD | 849-850 | "Enforces the authorization rule" and "all time arithmetic" are overstated: `getMonth`, `setMinutes` and `new Date(y, m, d)` stay allowed. The ban also hits `time.ts` itself. | Calibrate the wording, list the exact selectors, and exempt `time.ts`. |
| N3 | ST | 890 | "Design tokens" and "base colour" have no values. | Give the values. |
| N4 | ST | 945 | "§3 ownership table" doesn't exist under that name. | Say "the Rules column in §3". |
| N5 | ST | 960, 1063 | "Possibly missed" is lower case in prose. | "Possibly Missed". |
| N6 | ST | 970 | DELETE also needs `expectedVersion` in the query (§7 line 312). | Say so. |
| N7 | ST | 1006-1007 | "A link" doesn't say to what. The password-reset template isn't described. | Name the link target and describe the template. |
| N8 | ST | 1065 | "Reverse order" is ambiguous. | "Newest `auto_change` first". |
| N9 | ST | 1083 vs 1095 | "One file per row" vs "one file per path". | Use "per path". |
| N10 | ST, CD | 1123 | Better Auth returns a plain 429, not the app's `RATE_LIMITED` body. | "On HTTP 429". |
| N11 | CD | 989 | In Next 15 and later, route `params` is a Promise. | `withStudent` awaits `params`. |
| N12 | CD | 812 | "Never sends anything" conflicts with the ADR-0002 rewording at line 1378. | Use the new wording. |
| N13 | CD | 1169 | "Anything else reconnects" includes `connectionReplaced` and `forbidden`, which can loop. | List the reasons that stop reconnecting. |
| N14 | ST | 1196 | "7 days or 60 messages" is ambiguous. | "The last 7 days, at most 60 messages". |
| N15 | ST | 1231 | "(100% and 95%)" doesn't say what each figure applies to. | "100% on deadline cases, 95% overall". |
| N16 | ST | 1260 | The category list leaves out deletions and doesn't reach "about 20" cases. | Complete the list and give the count. |
| N17 | CD | 1026 | Archiving erases text by the *current* group links, so older messages from re-linked groups keep their text. | Erase by the Semester at the time each message was received. |
| N18 | ST | 1350 | The offline-key requirement is separate from the steps where the keys are made. | Move it into steps 4 and 5. |
| N19 | ST | 1379 | "(so the phone still gets notifications)" isn't proven yet. | "Intended to keep phone notifications; checked in M0". |
| N20 | ST | 1395 | "Misplaced" is a judgment word. | State the reason instead (Attendance is an M2 requirement). |
| N21 | CD | 1412 | With Baileys' transitive dependencies, `npm audit --audit-level=high` may fail permanently. | Define an override or allowlist policy. |
| N22 | ST | 1413 | "Covered by the integration and end-to-end tests" is overstated: components, scheduler jobs and the socket have no listed tests. | Calibrate the wording. |
| N23 | ST | 1418 | "750 MB in steady state" doesn't say whether it is the total for all containers, or what "steady state" means. | Define both. |
| N24 | ST, CD | 999 (vs §8 line 371) | The email code is in `src/server/email/` here but in `src/worker/email/` in the §8 tree. | Change §8 to match the plan. |

---

## Notes for the Elephant

- **Library claims not checked.** No reviewer could verify library APIs through Context7. Confirm these against the pinned versions before writing fixes: B4 (Baileys `append`), M2 (`disableSignUp`), M17 (Put Blob chunking), M29 (Resend base URL), M30 (drizzle `check()`/`.where()`), M31 (Better Auth uuid ids) and M35 (Baileys auth serialization).
- **Severity changes.** CD raised M6 (the lint allowlist) as a Blocker. I rated it Major because the fix is mechanical.
- **Deduplication.** Where reviewers overlapped, I merged their findings and kept the highest severity, except for M6.
