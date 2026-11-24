# M1a release check (#18)

The operational checks before calling M1a done (design, Verification Plan). Production: `coursemanager-4c82dd.indiasouthcentral.cloudapp.azure.com`, main at `c3a7be9`.

| Check | Bar | Result | Met? |
|---|---|---|---|
| Memory | total resident memory of all containers, sampled with `docker stats` every 5 minutes for 24 hours, averages ≤ 750 MB | 288 samples, 2026-11-22 14:20 to 2026-11-23 14:25 UTC: average 234 MB (239 MB leaving out the hour the worker was stopped), peak 293 MB. Per container on average: web 100, worker 79, Postgres 32, Caddy 28 MB | yes |
| Alerts | stopping the worker produces healthchecks.io emails from both the reminders and capture checks within 70 minutes | worker stopped 2026-11-22 14:22 UTC, started 15:37 UTC; the Student received both the reminders and the capture emails | yes |
| Email | a Final Reminder and a Daily Digest for a real Assignment land in Gmail's Primary inbox | the Daily Digest was sent 2026-11-23 07:00 (Colombo); a Final Reminder and the Primary-inbox check are still to confirm | |
| Baseline (G1) | the Student records last semester's Missed Deadlines | about 5 Missed Deadlines last semester (the product owner's estimate, 2026-11-23); G1's target is none in a semester | yes |
| Restore | the restore test is recorded in `runbooks/backups-and-restore.md` (the design's file 83 calls it `restore.md`) | laptop rehearsal 2026-11-21 recorded; the VM restore against a real nightly backup is still to do (not in #18's list) | open |
| Docs | ADR-0003 to ADR-0006 written; ADR-0001 and ADR-0002 updated; CONTEXT.md and GLOSSARY.md match the design; setup covers Practical Courses (U13) | done in #18 | yes |
