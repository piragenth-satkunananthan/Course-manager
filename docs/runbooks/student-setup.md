# Setting up Course-manager for a Semester

For the Student, after the server is running (`provision-vm.md`) and the account exists (`create-student`). In M1 there is no wizard (it comes in M2); setup is done in Settings and on the Courses page, in this order.

## 1. The Semester

Settings → Semesters → **Add Semester**, with its start and end dates. The first one becomes current. Each new Semester: add it, choose **Set as current** on it first, then archive the old one. The Class Group moves to the current Semester by itself (U14); archiving erases the old Semester's stored message text (ADR-0006).

## 2. Courses

Courses → **Add Course** for each subject: code, name, lecturer and colour. Then, on each Course's page, add the Nicknames people use in messages ("ds", "iad").

**Practical Courses (U13).** When a subject has a separate practical code but shares the theory subject's WhatsApp group (for example theory SWT22022 and practical SWT22032 in the group "SWT22022/(22/23)"):

1. Add the theory Course (SWT22022) first.
2. Add the practical Course (SWT22032) with **Practical of** set to the theory Course.
3. Link **only the theory Course's group** (step 4). The practical has no group of its own: in the theory group, a message about the practical ("tomorrow practical is cancelled", "practical report due 27th", "come to mac lab") goes to SWT22032, and every other message to SWT22022.

## 3. Weekly classes and open Deadlines

On each Course: add its weekly Class Sessions (lecture, tutorial, lab). The app never reads messages from before a group was linked, so add the Assignments and Exams that are already open by hand (dashboard → **Add**).

## 4. WhatsApp

Settings → WhatsApp → enter the phone number with its country code → **Get pairing code** → on the phone, WhatsApp → Settings → Linked devices → Link with phone number → enter the code.

Then link the groups:
- each Course Group to its Course (a group named after a Course code shows a **Link to <code>** suggestion; press it to confirm);
- the Class Group to the Semester;
- a practical subject's group: only the theory Course, as above.

Only linked groups are read. Before linking, the Class Representative pins the notice that messages are kept until the end of the Semester and processed by an AI service.

## 5. Email

Check that the morning digest and Final Reminders arrive in Gmail's Primary inbox; if not, add a Gmail filter for the sender ("Never send it to Spam").

## While the Semester runs

- The Activity Log shows every Auto Change with Undo, Possibly Missed messages (Add Assignment, Add Exam, Dismiss, and Add Practical Course for a practical message whose Course has none) and Unknown Courses (Add course, Nickname of…, Ignore).
- Settings → WhatsApp → **Auto Changes** pauses them; messages wait and are processed on Resume.
- Once a month, download the latest backup (`backups-and-restore.md`, Part 2).
