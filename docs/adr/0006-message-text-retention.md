# Message text is kept until its Semester is archived

Decision D1 (product owner, 2026-11-21). The text of every message from a linked group is stored, encrypted with `DATA_ENCRYPTION_KEY`, until the Semester it arrived in is archived; then it is erased. Messages from chats that aren't linked are dropped inside Baileys and never stored. Edits, corrections, Undo explanations and the Activity Log's source messages all need the text after the first read.

## Considered Options

- **Delete immediately after the AI reads it**: rejected. An edit or a delete arriving later couldn't be matched to what it changed, and the Activity Log couldn't show why a change was made.
- **Keep 72 hours**: rejected. Corrections and repeat announcements often come days later.

## Consequences

- The Class Representative pins a notice in each linked group saying messages are kept until the end of the Semester and processed by an AI service (ADR-0004).
- Archiving a Semester erases the text of its messages; a stored message keeps the Semester it arrived in, even when the Class Group moves to the next Semester (U14).
- Deleting the account deletes everything at once; backups age out within 7 days.
- The encryption key lives in the root-only `.env` on the VM, with an offline copy kept by the product owner; without it, restored message text can't be read.
