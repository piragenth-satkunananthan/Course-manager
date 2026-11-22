# Reminders are emails sent through Resend

The goal is no missed Assignment deadlines, and the product owner checks Gmail daily. So the reminders are emails: a Daily Digest each morning (Due soon, Added or moved, Check these) and a Final Reminder 4 hours before each Deadline. They go through Resend's HTTPS API, from the worker's scheduler; the web app also sends password-reset links and the account-deleted confirmation through it.

## Considered Options

- **The Calendar Feed as the main reminder**: rejected. A calendar alarm is easy to dismiss and doesn't say what changed; the feed stays an M2 extra.
- **Push notifications / an installable PWA**: out of scope for v1.
- **SMTP through Gmail**: rejected; an app password on the Student's own account, and weaker deliverability tracking.

## Consequences

- With no verified domain, Resend sends from its shared address and delivers only to the Resend account's own email. That's fine while v1 has one Student; a second Student needs a verified domain and `EMAIL_FROM`.
- A Gmail filter for the sender ("Never send it to Spam") keeps the emails in Primary.
- Each email is logged in `email_log` before it is sent, with an idempotency key, so a retry never double-sends; a reminder that still fails at its Deadline alerts.
- `RESEND_API_KEY` must reach every container that sends email (web and worker).
