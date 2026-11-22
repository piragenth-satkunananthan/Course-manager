# Course-manager

A personal workspace where a university student keeps their courses, timetable, assignments, exams and notes in one place instead of scattered across chats, PDFs and apps.

## Language

**Student**:
The person using Course-manager to organise their own studies.
_Avoid_: User, learner, account

**Course**:
A university subject the Student is enrolled in, such as "CS2010 Data Structures". Belongs to one Semester.
_Avoid_: Module, unit, subject, class

**Nickname**:
Another name people use for a Course in messages, such as "DS" or "data structures".
_Avoid_: Alias, short name, tag

**Unknown Course**:
A course named in a group message that matches none of the Student's Courses or Nicknames. It's logged for the Student to add, map to a Nickname, or ignore.
_Avoid_: New course, missing course, dismissed course

**Break Week**:
A week inside a Semester with no Class Sessions, such as a mid-semester study break.
_Avoid_: Holiday, vacation, off week

**Holiday**:
A single day inside a Semester with no Class Sessions, such as a Poya day or a public holiday.
_Avoid_: Day off, closure, leave

**Archived**:
A Semester or Course that has ended. It stays readable but leaves the dashboard.
_Avoid_: Closed, deleted, past

**Semester**:
A teaching period that groups Courses, such as "Year 2, Semester 1", running from a start date to an end date. The end date can move when the Semester is extended. One Semester is current; past ones are archived.
_Avoid_: Term, period

## Timetable

**Class Session**:
A repeating slot of a Course: a Lecture, Tutorial or Lab on a fixed weekday, time and location.
_Avoid_: Class, slot, period

**Occurrence**:
One dated instance of a Class Session, after any Session Change is applied.
_Avoid_: Instance, lesson, meeting

**Session Group**:
A subset of a Course's students who attend their own Class Sessions, such as "Group A" for labs. A Student belongs to at most one per Course.
_Avoid_: Group (clashes with WhatsApp groups), lab group, batch, section

**Attendance**:
Whether the Student was Present, Absent or Excused at one occurrence of a Class Session. A Course's attendance rate decides whether the Student may sit its exams.
_Avoid_: Presence, check-in, roll call

**Session Change**:
A one-off change to the timetable: one occurrence of a Class Session cancelled or rescheduled, or an extra one-off session added.
_Avoid_: Exception, override, update

## Work

**Assessment**:
Umbrella word for anything a Course grades. Every Assessment is either an Assignment or an Exam.
_Avoid_: Evaluation, graded work

**Assignment**:
An Assessment the Student hands in by a due date, such as a report, lab sheet or project. Its status is To do, In progress or Submitted.
_Avoid_: Task, homework, coursework

**Exam**:
An Assessment held at a set date, time and location, such as a quiz, mid-term, viva or presentation, with a list of topics to revise. Its date may be TBA until announced.
_Avoid_: Test, paper

**Overdue**:
An Assignment whose due date has passed but which is not yet Submitted.
_Avoid_: Late, past due

**Missed Deadline**:
A real Assignment not submitted by its true due time, whether or not it was in Course-manager. Counting these is how success is measured.
_Avoid_: Late submission, failed deadline

**Deadline**:
The due date of an unsubmitted Assignment or the date of an Exam. It is never entered on its own.
_Avoid_: Due item, reminder

**Daily Digest**:
The email a Student receives each day listing upcoming Deadlines and Deadlines that were added or moved.
_Avoid_: Reminder, notification, newsletter, summary

**Final Reminder**:
The email a Student receives 4 hours before a Deadline.
_Avoid_: Alert, notification, last call, ping

**Calendar Feed**:
A private calendar link that shows the Student's Class Sessions and Deadlines in their own calendar app.
_Avoid_: ICS, calendar sync, calendar export

## Notes

**Note**:
Written study material for a Course, optionally with Attachments.
_Avoid_: Document, page

**Attachment**:
A file, usually a PDF, uploaded to a Note.
_Avoid_: Upload, file, resource

## WhatsApp

**Practical Course**:
A Course for the practical part of another (theory) Course, with its own course code. The Student picks the theory Course once ("Practical of"). A theory Course has at most one Practical Course. Its notices arrive in the theory Course's Course Group and say "practical" (or name a lab room, such as "mac lab") without its code.
_Avoid_: Lab course, practical subject

**Course Group**:
The WhatsApp group for one Course, linked to that Course. It also covers that Course's Practical Course, if it has one.
_Avoid_: Course chat, channel

**Class Group**:
The WhatsApp group shared by the whole class, linked to the Semester. Its messages may concern any Course.
_Avoid_: Common group, batch group, main group

**WhatsApp Link**:
The connection between a Student's WhatsApp number and Course-manager that lets it read their Course Groups and Class Group.
_Avoid_: Bridge, bot, integration, sync

**Auto Change**:
A change the AI made to the Student's data because of a group message. It can be undone.
_Avoid_: Suggestion, suggested change, update

**Possibly Missed**:
A group message that looks like it announces a Deadline but caused no Auto Change.
_Avoid_: Flagged message, suspicious message

**Activity Log**:
The Student's record of what the AI did and what needs their attention: Auto Changes (each with the message that caused it), Unknown Courses, Possibly Missed messages and alerts.
_Avoid_: History, audit trail, feed

**Class Representative**:
The student who posts official class announcements, mainly in the Class Group.
_Avoid_: Class rep, CR, monitor
