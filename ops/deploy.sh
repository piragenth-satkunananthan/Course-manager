#!/usr/bin/env bash
# Deploys one image tag (design file 78). Run on the VM as root by .github/workflows/deploy.yml:
#   sudo /opt/course-manager/ops/deploy.sh <sha>
set -euo pipefail
SHA="${1:?usage: deploy.sh <sha>}"
cd /opt/course-manager

# Record the tag in .env so every later `docker compose` command resolves the same images.
sed -i '/^IMAGE_TAG=/d' .env && echo "IMAGE_TAG=$SHA" >> .env
# Read only what this script needs; .env is Compose syntax, so it is never sourced by the shell.
env_value() { grep -m1 "^$1=" .env | cut -d= -f2-; }
APP_HOST="$(env_value APP_HOST)"
BACKUP_AGE_RECIPIENT="$(env_value BACKUP_AGE_RECIPIENT)"
: "${APP_HOST:?APP_HOST missing from .env}" "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT missing from .env}"

# 1. Encrypted pre-deploy dump, keeping the last 3. Skipped only on the very first deploy, when no database volume exists yet.
mkdir -p backups
if docker volume inspect course-manager_pgdata >/dev/null 2>&1; then
  docker compose up -d --wait postgres
  docker compose exec -T postgres pg_dump -U app -d course_manager -Fc | age -r "$BACKUP_AGE_RECIPIENT" > "backups/predeploy-$SHA.dump.age"
  ls -1t backups/predeploy-*.dump.age | tail -n +4 | xargs -r rm --
fi

# 2-5. Pull, stop the worker (only one WhatsApp connection may exist), migrate, start.
docker compose pull
docker compose stop worker
docker compose up -d --wait postgres
docker compose run --rm migrate
docker compose up -d web worker caddy

# 6. Wait up to 120 s for the app to answer through Caddy (the first deploy also waits for the certificate).
# shortcut: #9 adds the wait for a fresh health_signal(scheduler).
for _ in $(seq 1 24); do
  if curl -fsS --max-time 5 "https://$APP_HOST/api/health" >/dev/null; then
    echo "deployed $SHA"
    exit 0
  fi
  sleep 5
done
echo "health check failed after 120 s; roll back with: deploy.sh <previous-sha>" >&2
exit 1
