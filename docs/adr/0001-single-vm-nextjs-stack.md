# Single Azure VM running a Next.js + Postgres stack

Course-manager is a web app (browser only, no installable PWA) hosted within the $100 Azure for Students credit, with free services preferred. We run everything on one B1s Linux VM with Docker Compose: a Next.js + TypeScript app (Tailwind + shadcn/ui, Better Auth, Drizzle), a separate worker for the WhatsApp Link (Baileys) and the NVIDIA NIM calls, PostgreSQL, and Caddy for HTTPS. Nightly encrypted database backups go to private Azure Blob Storage (Attachments join them in M2). The web app's own API is REST under `/api/v1` with zod-validated bodies (decision D3), not server actions or tRPC, so the worker, scripts and tests can call it the same way. The external services are Resend (email, ADR-0005), healthchecks.io (the reminders, capture and backup heartbeats), NVIDIA NIM (the AI, ADR-0004) and Azure Blob (backups). The WhatsApp Link needs an always-on process, and one VM is the only free option that provides one.

## Considered Options

- **App Service + Azure Database for PostgreSQL + a VM for the worker**: rejected. It means three services to configure, it still needs the VM, and App Service's free tier can't keep a process running.
- **whatsapp-web.js instead of Baileys**: rejected. It runs a headless Chromium, which doesn't fit in 1 GB of RAM next to the app and the database.

## Consequences

- 1 GB of RAM is the tight constraint. Every container gets a memory limit, and the VM has swap. Images are built in GitHub Actions and pushed to GitHub's container registry (GHCR), because a Next.js build runs out of memory on the VM.
- The B1s free allowance may only last 12 months, so expect to move to paid tiers or another host after that.
- The memory budget is in the design (§1, "Memory budget"): container caps of 192 MB (postgres), 256 MB (web), 320 MB (worker) and 48 MB (Caddy), and a target of 750 MB total resident memory averaged over 24 hours, checked in the M1a release check.
- If the credit or student eligibility runs out, the fallback is another cloud's free credits (for example AWS): the images are portable and the stack is plain Docker Compose.

## Priced resources

| Resource | Monthly cost |
|---|---|
| B1s VM | free (Azure for Students free services, 12 months) |
| OS disk, 64 GB P6 SSD | free (same, 12 months) |
| Standard static public IP | about $3.65 (about $0.005/hour; not on the free list), paid from the credit |
| Blob storage (backups, Standard LRS, 7-day expiry) | free within the 5 GB free amount (a week of dumps is well under 1 GB) |
| Outbound data (egress) | free within Azure's monthly free outbound amount (one Student's pages and emails) |

Confirm the exact prices for the region in the Azure pricing calculator. There are no budget alerts (the product owner's decision, 2026-11-21): when the credit runs out, the subscription is disabled, not billed.
