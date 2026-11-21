# Course-manager

A private web app for one university student: Assignments, Exams and the class timetable in one place, kept up to date from linked WhatsApp class groups, with email reminders.

- What and why: [`CONTEXT.md`](CONTEXT.md), [`GLOSSARY.md`](GLOSSARY.md)
- How: [`docs/designs/course-manager.md`](docs/designs/course-manager.md), ADRs in [`docs/adr/`](docs/adr/), UI in [`docs/design-system.md`](docs/design-system.md)
- Running the VM: [`docs/runbooks/`](docs/runbooks/)

## Local setup

Needs Node 22+ and Docker.

```bash
npm ci
docker compose -f compose.dev.yaml up -d --wait     # Postgres with course_manager and course_manager_test
cp .env.example .env                                 # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
set -a; . ./.env; set +a
npm run db:migrate
npm run create-student                               # prompts for email and password (12+ characters)
npm run dev                                          # http://localhost:3000
```

`npm run worker` starts the worker: it takes the single-instance lock and runs the scheduler every minute (Final Reminders, and the Daily Digest between 07:00 and 09:00 Sri Lanka time). Emails need `RESEND_API_KEY` and `EMAIL_FROM` in `.env`; with Resend's test sender (`onboarding@resend.dev`) they can only go to the address the Resend account is registered with.

To send real emails once, at a chosen time (for example inside the digest window): `npx tsx scripts/run-scheduler.ts --at 2026-11-22T07:30:00+05:30`.

## Tests

| Command | What |
|---|---|
| `npm run lint`, `npm run typecheck` | Static checks |
| `npm test` | Unit tests (and the M0 spike tests) |
| `npm run test:int` | Integration tests against `course_manager_test` (the database is reset each run) |
| `npm run build && npm run e2e` | Playwright at phone and desktop sizes, on port 3100 |
| `npm run audit` | `npm audit` at high severity, minus `audit-allowlist.json` entries that haven't passed their review date |

## Deploying

CI builds `ghcr.io/<owner>/course-manager-{web,worker}:<sha>` on every push to `main`. Deploying is manual: run the **Deploy** workflow with that SHA. It needs these secrets in the `production` environment: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` and `DEPLOY_KNOWN_HOSTS`. It copies `compose.yaml`, `Caddyfile` and `ops/` to `/opt/course-manager/` and runs `ops/deploy.sh <sha>`: an encrypted pre-deploy dump, pull, migrate, start, then a wait for `/api/health`. To roll back, deploy the previous SHA.

Create the account once, after the first deploy:

```bash
cd /opt/course-manager && sudo docker compose run --rm worker node dist/create-student.js
```
