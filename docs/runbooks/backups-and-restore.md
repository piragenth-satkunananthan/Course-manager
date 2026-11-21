# Backups, health checks and restore

These are production actions: the product owner runs them or approves each one. They follow `provision-vm.md`, which sets `RG`, `VM` and `LOC` and creates the `age` key pair (`backup.agekey`, kept offline).

## Part 1: set up (once)

### 1.1 Blob storage for backups, with 7-day expiry

On the laptop:

```bash
export SA=cmbackups$(openssl rand -hex 3)        # storage account names are global and lowercase
az storage account create -g "$RG" -n "$SA" -l "$LOC" --sku Standard_LRS --kind StorageV2 --min-tls-version TLS1_2 --allow-blob-public-access false -o table
az storage container create --account-name "$SA" -n backups --auth-mode login -o table

# Delete backups older than 7 days (design §14).
cat > /tmp/lifecycle.json <<'JSON'
{"rules":[{"enabled":true,"name":"expire-backups","type":"Lifecycle",
  "definition":{"filters":{"blobTypes":["blockBlob"],"prefixMatch":["backups/"]},
  "actions":{"baseBlob":{"delete":{"daysAfterModificationGreaterThan":7}}}}}]}
JSON
az storage account management-policy create --account-name "$SA" -g "$RG" --policy @/tmp/lifecycle.json -o table

# A write-only SAS for the VM: create and write, no read or list, valid one year. Renew it before it expires.
az storage container generate-sas --account-name "$SA" -n backups --permissions cw --expiry "$(date -u -d '+1 year' +%Y-%m-%dT%H:%MZ)" --auth-mode key -o tsv
```

**Check:** `az storage account management-policy show --account-name "$SA" -g "$RG"` shows the `expire-backups` rule.

### 1.2 healthchecks.io checks

Create three checks, emailing your Gmail (design §10):

| Check | Period | Grace | Pinged by |
|---|---|---|---|
| `reminders` | 1 minute | 60 minutes | the worker, while the scheduler and email are healthy |
| `capture` | 1 minute | 60 minutes | the worker, from #11 (create it then) |
| `backup` | 1 day | 26 hours | `ops/backup.sh`, after a successful upload |

So a stopped worker or VM is emailed within about 61–70 minutes, and a missed backup within 26 hours.

### 1.3 Secrets on the VM

```bash
sudo sh -c 'printf "BACKUP_CONTAINER_URL=%s\n" "https://<SA>.blob.core.windows.net/backups" >> /opt/course-manager/.env'
sudo sh -c 'printf "BACKUP_SAS=%s\n" "<the SAS from 1.1>" >> /opt/course-manager/.env'
sudo sh -c 'printf "HEALTHCHECK_REMINDERS_URL=%s\nHEALTHCHECK_BACKUP_URL=%s\n" "<reminders ping URL>" "<backup ping URL>" >> /opt/course-manager/.env'
```

The worker reads `HEALTHCHECK_REMINDERS_URL` after the next deploy (the Deploy workflow).

### 1.4 The nightly backup

`ops/` is copied to `/opt/course-manager/ops/` by every deploy. Install the cron line once:

```bash
sudo crontab /opt/course-manager/ops/crontab     # 02:00 Asia/Colombo (20:30 UTC)
sudo /opt/course-manager/ops/backup.sh           # run it once now
```

**Check:** the output ends with `backup uploaded: <date>.dump.age`, the file is in the container, and the `backup` check on healthchecks.io turns green.

### 1.5 Test that stopping the worker emails you

```bash
cd /opt/course-manager && sudo docker compose stop worker
```

Within about 70 minutes, healthchecks.io emails that `reminders` is down, and the app shows "Reminders may be delayed". Then `sudo docker compose start worker`. Log the times in the restore-test log below.

## Part 2: monthly, download a backup (decision U9)

Backups live in the same Azure subscription as the VM. Once a month, keep a copy off Azure:

```bash
az storage blob download --account-name "$SA" -c backups -n "$(date -u +%F).dump.age" -f ~/course-manager-backups/$(date -u +%F).dump.age --auth-mode login
```

It stays encrypted; only `backup.agekey` opens it.

## Part 3: restore

**Prerequisites, both offline (from your password manager):**
- `backup.agekey`, the `age` private key, to decrypt the backup;
- the `DATA_ENCRYPTION_KEY` line, so restored WhatsApp keys and message text can be read. Without it the data restores, but stored message text stays unreadable.

1. **Get the backup** (on the laptop): download the newest `<date>.dump.age` (Part 2), then decrypt it:
   ```bash
   age -d -i backup.agekey -o restore.dump <date>.dump.age
   ```
2. **Prepare the VM.** On a rebuilt VM, follow `provision-vm.md` first and put the offline `DATA_ENCRYPTION_KEY` back into `/opt/course-manager/.env`, with the other secrets. Copy `restore.dump` to the VM: `scp restore.dump <vm>:`.
3. **Restore into a fresh database:**
   ```bash
   cd /opt/course-manager
   sudo docker compose stop web worker
   sudo docker compose down postgres && sudo docker volume rm course-manager_pgdata   # only when replacing a damaged database
   sudo docker compose up -d --wait postgres
   sudo docker compose exec -T postgres pg_restore -U app -d course_manager --no-owner --clean --if-exists < ~/restore.dump
   ```
4. **Deploy the matching version.** Run the Deploy workflow with the SHA that was running when the backup was taken (`IMAGE_TAG` in the old `.env`, or the latest main). Migrations then bring the schema up to date.
5. **Force a WhatsApp re-link** (from #11): restored signal keys are out of date, so clear them and pair again from Settings:
   ```bash
   sudo docker compose exec -T postgres psql -U app -d course_manager -c "delete from wa_auth_key; update wa_session set creds_enc = null, status = 'unlinked';"
   ```
6. **Check:** sign in, see your Courses and Deadlines, and wait for the next scheduler tick (the banner clears within a minute).

## Restore-test log

| Date | Where | What | Result |
|---|---|---|---|
| 2026-11-21 | Laptop rehearsal (production `compose.yaml` Postgres, fake Blob) | `ops/backup.sh` → encrypted upload → download → `age -d` → `pg_restore` into a fresh Postgres 16 | Restored all 16 tables, the user and the Semester; `health_signal(backup)` recorded |
| _to do_ | The VM | Part 3 against a real nightly backup, before M1a ships | |
| _to do_ | The VM | Part 1.5: stop the worker, note when the `reminders` email arrives | |
