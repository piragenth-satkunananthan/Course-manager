# Settings design: more control for the Student

> **Status: approved by the product owner on 2026-11-26 (U44–U47).** Built before M2.

The Student asked for a Settings page they can customise as much as possible: notification times, the AI key and model, and a way to see whether the AI is working. Today Settings has three sections (Semesters, WhatsApp with the Auto Changes switch, Account), and the digest time, digest range, reminder lead time and the AI key are fixed.

Every new setting starts at **today's behaviour**, so nothing changes until the Student changes it. Times are Asia/Colombo.

## Layout

One page with a section list (a side list on desktop, a jump list at the top on phones):

1. Notifications (new)
2. AI (new)
3. Email and alerts (new)
4. Defaults (new)
5. Dashboard (new)
6. Semesters (existing)
7. WhatsApp (existing)
8. Account (existing)

M2 later adds Appearance (#43), Calendar Feed (#60) and Your data (#61) in this list (design m2.md "Where the groups meet": its Settings order is extended by these new sections, placed first).

Each section saves on its own with a Save button (U7 conflict rule), shows "Saved" on success, and has "Reset to default".

## Settings

| Section | Setting | Choices | Default (today) |
|---|---|---|---|
| Notifications | Daily Digest | On / off, and a send time 05:00–11:00 in 30-minute steps | On, 07:00 |
| Notifications | Digest covers | the next 1–7 days | 2 days |
| Notifications | Final Reminder | 1 h, 2 h, 4 h, 8 h, 1 day before | 4 h |
| Notifications | Second reminder | off, or 1 day / 2 days / 1 week before | off |
| Notifications | Quiet hours | off, or a start and end time | off |
| AI | Status | read-only: working / delayed / stopped, last success, messages waiting, the last error; a "Test AI now" button | – |
| AI | API key | paste a new NVIDIA NIM key; shown only as `••••last4` | the server's key |
| AI | Model | a list of the models the key can use | `nvidia/nemotron-3-ultra-550b-a55b` |
| Email and alerts | Send emails to | an email address, confirmed by a link sent to it | the login email |
| Email and alerts | Alerts | on/off per kind: WhatsApp disconnected, AI failing, too many changes in one batch | all on |
| Defaults | Default due time | when a message gives a due date but no time | 23:59 |
| Defaults | Week starts on | Monday / Sunday | Monday |
| Defaults | Time format | 24-hour (14:00) / 12-hour (2:00 pm) | 24-hour |
| Dashboard | Due soon covers | the next 3–30 days | 14 days |
| Dashboard | Sections | show/hide and order: Overdue, Today, Due soon, TBA Exams, Check these, Recent changes | all shown, today's order |

## Rules

- **Quiet hours:** no email is sent inside them. A Final Reminder that would fall inside is sent just before quiet hours start; the digest time can't be set inside them. Alerts that need action now (WhatsApp logged out, AI key refused, a reminder that couldn't be sent) are still sent: missing them is how deadlines are missed.
- **Second reminder:** the same email as the Final Reminder ("Due in 1 day: …"), each logged once per Deadline and due time, as today.
- **Alerts that can't be turned off:** the healthchecks.io emails (worker or backup stopped) come from outside the app, and "a reminder couldn't be sent" stays on. The Settings page says so.
- **Email address:** the new address is used only after its confirmation link is opened; until then, emails go to the old one. Sign-in still uses the login email.
- **Default due time:** applies to new Assignments only (from the AI and the Add form); existing ones keep their times. The AI prompt reads it from the context instead of the fixed 23:59, so this is a prompt change (eval twice).
- **Week starts on and time format:** display only: the week grid, the month view, the date pickers and email times. Data is unchanged.
- **Dashboard sections:** Overdue can be moved but not hidden (it's how missed deadlines show).

### The AI key and model (security; needs ADR-0007)

ADR-0002 keeps secrets in a root-only file on the VM. Letting the Student change the key in the app means:

- The key is stored in the database **encrypted with the existing data key** (the one that encrypts WhatsApp keys, kept off the database). It is never sent back to the browser, logged or exported.
- Saving a key first calls NIM's model list with it; a refused key isn't saved.
- The worker checks for a new key or model each minute and switches without a restart; the server file's key stays as the fallback, and "Use the server's key" removes the saved one.
- **Model:** the list comes from NIM. Changing the model shows a warning that the AI test set has only been passed on the pinned model, and runs "Test AI now" on the new one; the previous model is one tap away ("Switch back"). The model and prompt version are recorded on each AI batch, as today.

### "Test AI now"

Sends one short request to NIM with the current key and model and shows the result in seconds ("Working: answered in 0.8 s" or the error in plain words). It changes nothing and is rate-limited to once every 10 seconds.

## Data

One migration (expand-only): settings columns on the existing per-Student settings row (where `auto_changes_paused` lives), plus `nim_api_key_encrypted`, `nim_model`, `notify_email`, `notify_email_pending` with its confirmation token, and the dashboard layout as a small JSON array. The second reminder needs one more email-log kind.

## Changes to approved requirements

These need the product owner's OK (this document's approval) and become decisions U44 and on: the digest time, digest range, reminder lead time and default due time become settings (CONTEXT.md and design §8 say 07:00, 2 days, 4 h and 23:59); quiet hours delay or bring forward emails; the AI key can live in the database (ADR-0002 → ADR-0007).

## Tickets (build order)

1. **Settings layout and Notifications:** the section list; digest on/off, time and range; Final Reminder lead time; second reminder; quiet hours. Migration. Scheduler reads the settings.
2. **AI status and "Test AI now".**
3. **AI key and model in Settings:** ADR-0007; encrypted key; model list; switch-back.
4. **Email and alerts:** a confirmed email address; alert kinds on/off.
5. **Defaults:** default due time (prompt change, eval twice), week start, time format.
6. **Dashboard:** Due soon range; section show/hide and order.

Each ticket: unit tests for the rules, integration tests for the API and scheduler, e2e at phone and desktop sizes.
