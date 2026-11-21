#!/usr/bin/env bash
# Nightly encrypted backup (design file 79), run by root's cron at 02:00 Asia/Colombo (ops/crontab).
# Dump → encrypt to the age public key (the private key is kept offline) → upload to Blob → record health → ping.
set -euo pipefail
DIR="${COURSE_MANAGER_DIR:-/opt/course-manager}"
cd "$DIR"

# .env is Compose syntax, so it is read value by value, never sourced.
env_value() { grep -m1 "^$1=" .env | cut -d= -f2-; }
RECIPIENT="$(env_value BACKUP_AGE_RECIPIENT)"
CONTAINER_URL="$(env_value BACKUP_CONTAINER_URL)"
SAS="$(env_value BACKUP_SAS)"
PING="$(env_value HEALTHCHECK_BACKUP_URL || true)"
: "${RECIPIENT:?BACKUP_AGE_RECIPIENT missing}" "${CONTAINER_URL:?BACKUP_CONTAINER_URL missing}" "${SAS:?BACKUP_SAS missing}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT # temporary files go whether the backup succeeded or not
NAME="$(date -u +%F).dump.age"

docker compose exec -T postgres pg_dump -U app -d course_manager -Fc > "$TMP/cm.dump"
age -r "$RECIPIENT" -o "$TMP/$NAME" "$TMP/cm.dump"
curl --fail --silent --show-error --upload-file "$TMP/$NAME" -H "x-ms-blob-type: BlockBlob" "$CONTAINER_URL/$NAME?$SAS" > /dev/null

docker compose exec -T postgres psql -U app -d course_manager -v ON_ERROR_STOP=1 -q -c \
  "insert into health_signal (component, last_ok_at) values ('backup', now()) on conflict (component) do update set last_ok_at = excluded.last_ok_at"
if [ -n "$PING" ]; then curl --fail --silent --max-time 10 "$PING" > /dev/null || echo "backup ping failed" >&2; fi
echo "backup uploaded: $NAME"
