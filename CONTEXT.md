# Course-manager: product brief

Terms are defined in `GLOSSARY.md`. Architecture decisions are in `docs/adr/`.

## Problem

A university student's lectures, CAs, exams and study material are scattered across WhatsApp groups, PDFs and several apps. Course-manager puts them in one web app and keeps it current by reading the class WhatsApp groups.

## Goal

The pain to remove is **missed Assignment deadlines**. The product owner saw the announcements but **forgot** them, so this is a reminder problem, not a capture problem. Success means no missed Assignment deadlines in a semester. Exams are not a pain point.

## Users

- v1 has one Student: the product owner. There is no sign-up and there are no invites. Every record still carries its Student, so friends can be added later without reworking the data.
- Login is email + password, with password reset by email and a password change in Settings (which signs out other devices).
- In M1, setup happens in Settings and on the Courses page: Semester, then Courses, then Class Sessions, then linking WhatsApp groups (`docs/runbooks/student-setup.md`). In M2, first login opens a setup wizard: Semester, then Courses, then Class Sessions (with Session Groups), then the Deadlines already open, then linking WhatsApp groups. The same wizard can be run again from Settings when a new Semester starts.

## Requirements

### Courses and timetable
- A Semester has a start and end date, may be extended (its end date moves), and contains Break Weeks and Holidays (such as Poya days). One Semester is current; past ones are archived.
- A Course belongs to one Semester and has a code, name, lecturer name, a colour, and any number of Nicknames.
- Deleting a Course asks for confirmation and offers Archive instead.
- Class Sessions (Lecture, Tutorial or Lab) repeat between the Semester's start and end dates, skipping Break Weeks and Holidays. A Class Session can repeat every week or every 2 weeks, can start in week N, and can be tied to a Session Group.
- The Student picks their Session Group for each Course and only sees sessions for that group plus sessions open to everyone.
- Session Changes cancel or reschedule a single occurrence, or add a one-off extra session.

### Attendance (M2)
- The university requires a minimum Attendance to sit exams. Each Course has a minimum, defaulting to 80%.
- Each past Class Session occurrence is marked Present, Absent or Excused, with one tap from today's sessions on the dashboard.
- One rate per Course: Lectures, Tutorials and Labs count equally. Cancelled occurrences, Excused occurrences and unmarked occurrences don't count. An "unmarked" counter reminds the Student to catch up.
- Each Course shows "you can miss N more". It turns amber when N reaches 2, and turns red with a dashboard warning when the minimum can no longer be reached, even by attending every class left. The rate and the minimum are always shown side by side.

### Assignments, Exams and CA
- CA (Continuous Assessment) is graded work during the semester: everything except the final exam. A CA held in class (a CA test, quiz, mid-term, viva or presentation) is an Exam with the type "CA"; a CA handed in by a deadline (a project, group project or report) is an Assignment. The final exam is an Exam that isn't a CA. The app never says "Assessment".
- An Assignment is something you hand in by a due date (report, lab sheet, project). It has a title, due date and time, description, and a status of To do, In progress or Submitted. Two optional fields: where to submit it, and whether it's a group or individual piece of work.
- An Assignment with a due date but no time is due at 23:59 on that date.
- An Exam is held at a set time and place (quiz, mid-term, viva, presentation). It has a location and topics. Its date and time may be TBA.
- No grades or weightings in v1.

### Notes
- A Note belongs to a Course and uses a formatted-text editor (headings, lists, bold, links, code blocks).
- Attachments (mainly PDFs, max 20 MB) belong to Notes and are stored privately.
- Search covers the titles of Courses, Assignments, Exams and Notes, and the text of Notes. Searching inside PDFs comes later.

### Dashboard
- Overdue Assignments at the top, until marked Submitted.
- Today's Class Sessions with Session Changes applied.
- Deadlines for the next 14 days: unsubmitted Assignments and dated Exams, sorted by date. Exams marked TBA are listed separately.
- Auto Changes from the last 48 hours.
- A "WhatsApp disconnected" banner with a link to re-link through a pairing code. It also shows when the worker is down.
- The timetable is a week grid on desktop and a list for each day on mobile.
- A month view shows classes, Assignments and Exams together. Each day shows Deadline chips and a dot per class, and tapping a day opens its full list (M1b).
- Light and dark mode.

### Daily Digest
- Sent to the Student's email through Resend (see ADR-0005; the product owner uses Gmail, which they check daily).
- Each day's digest lists Deadlines due in the next 2 days, plus Deadlines that were added or moved since the last digest. It's sent at 07:00 in the Student's time zone and skipped when there's nothing to list.
- A Final Reminder email is sent 4 hours before each Deadline. If the Deadline moves, the reminder moves with it.
- Reminders stop once an Assignment is marked Submitted.

### Calendar Feed
- A private calendar link that contains the Student's Class Sessions (Session Changes applied) and Deadlines. The Student can reset the link if it leaks.

### WhatsApp Link and AI (see ADR-0002)
- A live link on the Student's personal number. It reads only: it sends no messages, read receipts or presence. Linking fails with a clear message if WhatsApp's linked-device limit is reached.
- Only explicitly linked groups are processed. Each Course Group is linked to one Course; each Class Group is linked to the Semester. Every other chat is dropped immediately.
- The class uses one or more Class Groups (for example a main group and a notices group), each kept for the whole degree, never one per Semester or per year. Setting a new Semester as current moves every Class Group to it, so none is left unlinked; messages already stored stay with the Semester they arrived in. In the Class Group, a practical message names the subject ("IAD practical report due 27th") and applies to that subject's Practical Course.
- A Practical Course shares its theory Course's Course Group. In that group, a message about the practical ("tomorrow practical is cancelled", "come to mac lab") applies to the Practical Course; every other message applies to the theory Course. A practical message in a group whose Course has no Practical Course is flagged Possibly Missed.
- In Settings, a group whose name contains a Course code (for example "SWT22022/(22/23)") shows a "Link to SWT22022" suggestion. Nothing is read until the Student presses it.
- There is no look-back. Messages sent before a group is linked are never read. At setup, the Student types in the Deadlines that are already open.
- English text messages, including English mixed with Tamil or Sinhala written in English letters. Tamil and Sinhala script, images and voice notes are ignored in v1.
- Every sender counts equally. The AI acts on statements, ignores questions and irrelevant chatter, and the most recently **sent** message wins when two disagree, whatever order they arrive in.
- The AI reads each message with the date it was sent and the group's recent messages, so it can work out relative dates ("tomorrow") and treat corrections as updates to an earlier change. It understands Sri Lankan time formats ("4.30"). It uses the Student's Session Group to decide whether a group-specific message applies.
- Before creating anything, the AI matches existing items, using Course codes, names and Nicknames, so a repeated announcement never makes a duplicate.
- The AI applies changes directly as Auto Changes: Session Changes, Assignments, Exams and Semester extensions, always inside Courses the Student already has. It never creates Courses.
- A message about an Unknown Course goes into the Activity Log with three actions: "Add course", "Nickname of…" and "Ignore". Adding or mapping applies the changes the messages asked for, as undoable Auto Changes. After Ignore, that name isn't logged again.
- Auto Changes can be paused in Settings; messages keep queuing and are processed on Resume (see ADR-0003).
- Every Auto Change appears in the Activity Log with the message that caused it and an Undo button. Undo is disabled once anything has changed that item since: the Student's own edit or a later message. A later message still overrides a manual edit.
- Edited messages are processed again. A deleted message undoes its Auto Change, unless the Student has edited that item since.
- Messages are sent to the AI in batches: one call per group every few minutes.
- PDF and Office files posted in a linked Course Group are saved as Attachments on that Course's "From WhatsApp" Note. Duplicates (same file contents) are skipped. Files over 20 MB are listed in the Activity Log, not saved. Images and video are not saved.
- The text of every message from a linked group is kept, encrypted, until its Semester is archived, then erased. Messages that look like a deadline but caused no change are flagged "Possibly missed" in the Activity Log, with "Add Assignment", "Add Exam" and "Dismiss". A message for another Session Group of that Course (one the Student has set up, but not theirs) is ignored quietly. A class change that can't be matched to exactly one class (no Course named in the Class Group, or several classes that day) is flagged "Possibly missed" too, never ignored.
- The AI runs on NVIDIA NIM. The product owner has confirmed that classmates and lecturers accept their messages being processed this way. The Class Representative pins a notice in each linked group saying messages are kept until the end of the Semester.
- **Gate (run in M0):** before Auto Changes go live, the AI must handle a test set of about 50 real messages from the product owner's groups correctly. The set includes times like "4.30", relative dates, Session Group messages, duplicate announcements, mixed English, and deletions.

### Time and language
- v1 is fixed to Asia/Colombo; there is no time-zone setting.
- The interface is in English.

### Security and data
- HTTPS only, hashed passwords, rate-limited login, and every query limited to the signed-in Student.
- WhatsApp session keys are encrypted when stored. The encryption key is kept off the database, in a root-only secret file on the VM, with an offline copy kept by the product owner.
- Attachments are served through short-lived links.
- Nightly backups, kept for 7 days. Restoring has been tested once and is documented.
- Attachments are kept in their own private storage, with 3 copies kept by Azure. A deleted Attachment can be recovered for 7 days, and the Attachments are downloaded each month along with the backups.
- "Export my data" downloads, as JSON plus the files, everything the Student made or can see in the app: Semesters, Courses, Nicknames, classes, Session Changes, Assignments, Exams, Attendance, Notes, linked groups and the Activity Log. Internal records (stored WhatsApp messages, AI batches, the email log, version history) are left out.
- "Delete my account" unlinks WhatsApp and deletes all data and files. Backups and deleted Attachments are erased within 7 days.
- Failures can't stay silent: healthchecks.io emails the Student when the worker's reminders or capture heartbeat, or the nightly backup, stops checking in, and the worker emails a direct alert for causes the Student must act on (WhatsApp logged out, the AI key refused or failing for an hour, too many changes in one batch, a reminder that couldn't be sent).

## Hosting and delivery

- One Azure for Students B1s VM (see ADR-0001), reached through its free Azure domain name. Spending must stay within the $100 Azure for Students credit, using free services where possible. There are no budget alerts (the product owner's decision, 2026-11-21): when the credit runs out, the subscription is disabled, not billed. If the credit or student eligibility runs out, the fallback is another cloud's free credits (for example AWS).
- Docker images are built in GitHub Actions and pushed to GitHub's container registry (GHCR). The VM only downloads them.

## Milestones

0. **M0, test run (about 1 week, before any app code)**: run the WhatsApp reader read-only on the product owner's groups and measure memory use, disconnects and whether phone notifications still arrive. Run about 50 real messages through NIM against expected results (100% on deadline messages, at least 95% overall). Check NIM's and the email provider's free limits. The output is a go/no-go note.
1. **M1a, first release (stops missed deadlines)**:
   - login, password reset and account deletion;
   - Semesters and Courses with Nicknames;
   - a basic timetable (weekly Class Sessions plus Session Changes, shown as a day list);
   - Assignments and Exams (TBA allowed);
   - the dashboard with the Overdue section;
   - the Daily Digest and Final Reminders;
   - the WhatsApp Link (pairing code) with AI Auto Changes, the Activity Log with Undo, and alerts;
   - deployment with CI, backups and a restore test.
   **M1b, a few weeks later**: the desktop week-grid timetable, the month view (classes, Assignments and Exams together), the filterable Assignment and Exam list pages, Undo batch, and the Activity Log's event items. See `docs/designs/course-manager.md`.
2. **M2, the rest of v1**: setup wizard; Break Weeks and Holidays; Session Groups, every-2-weeks and start-in-week-N options; Attendance; Notes with Attachments; search; dark mode; the Calendar Feed; export.
3. **M3**: saving files posted in groups as Attachments.

## Out of scope for v1

Other Students (friends) and sharing between Students, grades, push notifications (the Daily Digest is the reminder), imports from the university's learning system or calendar files, chat-export uploads, images and voice notes, Tamil and Sinhala script, searching inside PDFs, lecturer contact details and office hours, and installing the app on a phone (PWA).

## Later phases

- Joining and recording online classes in a sandbox. Before starting: confirm the university allows recording, and check whether a bot can get past the class platform's two-factor login.
- Images and voice notes through NIM's vision and speech models.
- Searching inside PDFs. Lecturer contact details and office hours.

## Open questions

- NIM's free limits, the chosen model and the email provider's free tier: see `docs/m0-report.md`.
