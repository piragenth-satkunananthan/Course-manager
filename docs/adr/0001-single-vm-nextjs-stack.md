# Single Azure VM running a Next.js + Postgres stack

Course-manager is a web app (browser only, no installable PWA) hosted within the Azure for Students free services. We run everything on one B1s Linux VM with Docker Compose: a Next.js + TypeScript app (Tailwind + shadcn/ui, Better Auth, Drizzle), a separate worker for the WhatsApp Link (Baileys) and the NVIDIA NIM calls, PostgreSQL, and Caddy for HTTPS. Attachments and nightly database backups go to private Azure Blob Storage. The WhatsApp Link needs an always-on process, and one VM is the only free option that provides one.

## Considered Options

- **App Service + Azure Database for PostgreSQL + a VM for the worker**: rejected. It means three services to configure, it still needs the VM, and App Service's free tier can't keep a process running.
- **whatsapp-web.js instead of Baileys**: rejected. It runs a headless Chromium, which doesn't fit in 1 GB of RAM next to the app and the database.

## Consequences

- 1 GB of RAM is the tight constraint. Every container gets a memory limit, and the VM has swap. Images are built in GitHub Actions and pushed to GitHub's container registry (GHCR), because a Next.js build runs out of memory on the VM.
- The B1s free allowance may only last 12 months, so expect to move to paid tiers or another host after that.
