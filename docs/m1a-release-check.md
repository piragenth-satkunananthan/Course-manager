# M1a release check (#18)

The operational checks before calling M1a done (design, Verification Plan). Production: `coursemanager-4c82dd.indiasouthcentral.cloudapp.azure.com`, main at `c3a7be9`.

| Check | Bar | Result | Met? |
|---|---|---|---|
| Memory | total resident memory of all containers, sampled with `docker stats` every 5 minutes for 24 hours, averages ≤ 750 MB | _pending: sampling from 2026-11-22 14:20 UTC (`/opt/course-manager/mem-24h.log`)_ | |
| Alerts | stopping the worker produces healthchecks.io emails from both the reminders and capture checks within 70 minutes | _pending: worker stopped 2026-11-22 14:22 UTC_ | |
| Email | a Final Reminder and a Daily Digest for a real Assignment land in Gmail's Primary inbox | _pending_ | |
| Baseline (G1) | the Student records last semester's Missed Deadlines | _pending: the product owner will estimate_ | |
| Restore | the restore test is recorded in `runbooks/backups-and-restore.md` (the design's file 83 calls it `restore.md`) | laptop rehearsal 2026-11-21 recorded; the VM restore against a real nightly backup is still to do (not in #18's list) | open |
| Docs | ADR-0003 to ADR-0006 written; ADR-0001 and ADR-0002 updated; CONTEXT.md and GLOSSARY.md match the design; setup covers Practical Courses (U13) | done in #18 | yes |
