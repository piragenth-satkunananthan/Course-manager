# The AI applies changes without review

The point of Course-manager is that Deadlines and class changes appear without the Student doing anything. So the AI applies what it reads in linked WhatsApp groups directly, as Auto Changes, with no approval step. The product owner accepted the risk that a misleading or malicious message is applied ("trust AI", 2026-11-21). Do not add a review queue in front of Auto Changes without asking.

## Considered Options

- **A suggestions inbox the Student approves**: rejected. It turns a reminder app back into a chore, and an unapproved suggestion is exactly the forgotten Deadline the app exists to prevent.
- **Review only risky changes** (cancellations, Deadlines moved later): rejected for v1; those are highlighted and emailed instead (below).

## Consequences

The safety model replaces review (design §3, §9):

- **Every write is versioned.** Each change to an AI-writable item writes an `entity_version` row and an `auto_change` row linked to the messages that caused it, shown in the Activity Log.
- **Undo.** Any Auto Change can be undone while nothing has changed the item since (the Undo rule); timetable changes and Semester extensions too (U16). An edited or deleted message withdraws what it caused.
- **Field ownership and precedence.** The AI can't touch status or submission, Courses or Nicknames. For each field, the most recently **sent** message wins (`field_set_at`), so a late, older message never overwrites a correction.
- **Validation before anything applies.** Every id must be real; dates must fall in the Semester; at most 10 operations per batch, the rest flagged Possibly Missed with an alert.
- **Risky changes are visible.** Cancellations and Deadlines moved later are highlighted for 7 days (U3) and listed in the digest's "Check these".
- **A pause switch** in Settings stops Auto Changes at once; messages queue and are processed on Resume.
- A convincing false announcement still gets applied. That is the accepted cost.
