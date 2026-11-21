# Runbook: provision the Azure VM

*   **Ticket:** #2 (M0)
*   **Design:** `docs/designs/course-manager.md`, §14 and file 82
*   **Who runs it:** the product owner. These are production actions on your Azure subscription (`CLAUDE.md`). Run each block yourself, or tell Claude which block to run and approve it.
*   **Time:** about 45 minutes.

Run **Part 1** on your laptop and **Part 2** on the VM over SSH. Every step ends with a **Check** whose output you compare with the expected result. Don't continue past a failed check.

> **Cost:** the B1s VM and its 64 GB P6 SSD are among Azure for Students' free services (for 12 months; Microsoft's pages also call B1s "always free" in places). The Standard public IP address **may not be free**, and is paid from the $100 credit. Check it in Step 1.8. If the credit runs out or expires, Azure **disables** the subscription instead of billing you ([Microsoft docs](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/azurestudents-subscription-disabled)).

---

## Part 1: on your laptop

### 1.1 Install and sign in

You need the Azure CLI, OpenSSH and `age` installed locally.

```bash
az login                      # opens a browser; sign in with your student account
az account show --query "{name:name, state:state, offer:id}" -o table
```

**Check:** `state` is `Enabled`, and the subscription is your *Azure for Students* one. If you have several subscriptions, run `az account set --subscription "<name>"`.

### 1.2 Choose names and a region

Azure for Students subscriptions have an **"Allowed resource deployment regions"** policy. Check which regions yours allows:

```bash
az policy assignment list --query "[?displayName=='Allowed resource deployment regions'].parameters.listOfAllowedLocations.value" -o tsv
```

On 2026-11-21 this subscription allowed `koreacentral`, `indiasouthcentral`, `eastasia`, `uaenorth` and `centralindia`. **`southeastasia` is not allowed.** Central India (Pune) is the nearest allowed region to Sri Lanka.

```bash
export RG=course-manager-rg
export VM=course-manager-vm
export LOC=centralindia
export DNS_LABEL=coursemanager-$(openssl rand -hex 3)   # must be unique in the region
echo "$DNS_LABEL"                 # write this down
```

**Check that B1s is offered in the region** (this command is fast):

```bash
az vm list-sizes --location "$LOC" --query "[?name=='Standard_B1s'].{name:name, cpu:numberOfCores, memMB:memoryInMB}" -o table
```

**Expected:** one `Standard_B1s` row with 1 CPU and 1024 MB. `az vm list-skus` also works, but it can take minutes.

**If `az vm create` fails:** on 2026-11-21 it failed in Central India with `SkuNotAvailable` ("Capacity Restrictions: Standard_B1s"). The CLI hid that message behind a `RuntimeError: The content for this response was already consumed`. Re-run with `--debug 2>&1 | grep -A3 "Exception Details"` to see the real error. The VM was then created in **`indiasouthcentral`**, with the resource group left in `centralindia` (a VM can be in a different region from its resource group). Pass `--location indiasouthcentral` to `az vm create`.

**The VM as created (2026-11-21):** `course-manager-vm`, Standard_B1s, in `indiasouthcentral`, FQDN `coursemanager-4c82dd.indiasouthcentral.cloudapp.azure.com`.

### 1.3 Create an SSH key for this server only

```bash
ssh-keygen -t ed25519 -f ~/.ssh/course-manager -C "course-manager-admin"
```

Protect the key with a passphrase.

**Check:** `~/.ssh/course-manager` and `~/.ssh/course-manager.pub` exist.

### 1.4 Create the resource group and the VM

```bash
az group create --name "$RG" --location "$LOC" -o table

az vm create \
  --resource-group "$RG" --name "$VM" --location "$LOC" \
  --image Ubuntu2404 \
  --size Standard_B1s \
  --storage-sku Premium_LRS --os-disk-size-gb 64 \
  --admin-username cmadmin \
  --authentication-type ssh --ssh-key-values ~/.ssh/course-manager.pub \
  --public-ip-sku Standard --public-ip-address-dns-name "$DNS_LABEL" \
  --nsg-rule SSH \
  -o table
```

If the `Ubuntu2404` alias isn't recognised by your CLI version, use `--image Canonical:ubuntu-24_04-lts:server:latest` instead.

**Check:**

```bash
az vm show -d -g "$RG" -n "$VM" --query "{size:hardwareProfile.vmSize, state:powerState, fqdn:fqdns, ip:publicIps}" -o table
```

**Expected:**
- `size` is `Standard_B1s`;
- `state` is `VM running`;
- `fqdn` is `<DNS_LABEL>.<LOC>.cloudapp.azure.com`.

Write the FQDN down.

### 1.5 Open only ports 22, 80 and 443

```bash
az vm open-port -g "$RG" -n "$VM" --port 80,443 --priority 900 -o none
az network nsg rule list -g "$RG" --nsg-name "${VM}NSG" --query "[].{name:name, port:destinationPortRange, ports:destinationPortRanges, access:access}" -o table
```

**Expected:** two inbound Allow rules: SSH on 22, and the rule for 80 and 443. No other inbound Allow rules.

### 1.6 Generate the backup key pair (stays on the laptop)

The **private** key never goes to the VM. Only its public "recipient" line does.

```bash
mkdir -p ~/course-manager-keys && chmod 700 ~/course-manager-keys
age-keygen -o ~/course-manager-keys/backup.agekey
grep '^# public key:' ~/course-manager-keys/backup.agekey    # copy the age1… value
```

**Store an offline copy now.** Put the whole `backup.agekey` file in your password manager, or on a USB drive kept somewhere safe. Without it, no backup can ever be restored.

### 1.7 Budget alerts (dropped)

The product owner decided on 2026-11-21 not to use budget alerts. When the credit runs out or expires, Azure disables the subscription instead of billing ([Microsoft docs](https://learn.microsoft.com/en-us/azure/cost-management-billing/manage/azurestudents-subscription-disabled)). The remaining credit can be checked at any time at the [Microsoft Azure Sponsorships balance page](https://www.microsoftazuresponsorships.com/Balance).

### 1.8 Check the public IP cost

```bash
az network public-ip list -g "$RG" --query "[].{name:name, sku:sku.name, ip:ipAddress}" -o table
```

The public IP is **not** on Azure's free-services list. A Standard static IPv4 costs about $0.005/hour (about $3.65/month, or about $44/year from the $100 credit). Stopping the VM doesn't stop this charge. Confirm the exact price for your region in the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/), and record it in `docs/m0-report.md`.

---

## Part 2: on the VM

```bash
ssh -i ~/.ssh/course-manager cmadmin@<FQDN>
```

### 2.1 Confirm that only key login is allowed

```bash
sudo sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin)'
```

**Expected:**
- `passwordauthentication no`
- `kbdinteractiveauthentication no`
- `permitrootlogin` is `no` or `without-password`

If password authentication shows `yes`, run this and check again:

```bash
echo -e "PasswordAuthentication no\nKbdInteractiveAuthentication no" | sudo tee /etc/ssh/sshd_config.d/90-course-manager.conf
sudo systemctl restart ssh
```

**Check from your laptop:** `ssh -o PubkeyAuthentication=no -o PreferredAuthentications=password cmadmin@<FQDN>` must fail with `Permission denied (publickey)`.

### 2.2 Update the system and keep it updated

```bash
sudo apt-get update && sudo apt-get -y upgrade
sudo apt-get -y install unattended-upgrades age ca-certificates curl
sudo dpkg-reconfigure -f noninteractive unattended-upgrades
cat /etc/apt/apt.conf.d/20auto-upgrades
timedatectl | grep 'Time zone'
```

**Expected:**
- both `APT::Periodic` lines in `20auto-upgrades` are `"1"`;
- the time zone is `Etc/UTC` (leave it: cron times are written in UTC);
- `age --version` prints a version.

Reboot if `/var/run/reboot-required` exists (`sudo reboot`, then SSH back in).

### 2.3 Add a 1 GB swap file

```bash
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/90-swappiness.conf && sudo sysctl --system >/dev/null
free -h
```

**Check:** `free -h` shows `Swap: 1.0Gi`. After a reboot, `swapon --show` still lists `/swapfile`.

### 2.4 Install Docker Engine and the Compose plugin

These come from Docker's official apt repository:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt-get update
sudo apt-get -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker cmadmin
```

Log out and back in, then:

```bash
docker run --rm hello-world && docker compose version
```

**Check:** "Hello from Docker!" is printed, and a Compose v2 version is shown.

### 2.5 Create the app folder and the secrets file

```bash
sudo mkdir -p /opt/course-manager
sudo touch /opt/course-manager/.env
sudo chmod 600 /opt/course-manager/.env && sudo chown root:root /opt/course-manager/.env
```

Generate the secrets on the VM and append them, without echoing them into your shell history:

```bash
sudo sh -c 'printf "DATA_ENCRYPTION_KEY=%s\n" "$(openssl rand -base64 32)" >> /opt/course-manager/.env'
sudo sh -c 'printf "BETTER_AUTH_SECRET=%s\n" "$(openssl rand -base64 32)" >> /opt/course-manager/.env'
sudo sh -c 'printf "POSTGRES_PASSWORD=%s\n" "$(openssl rand -hex 24)" >> /opt/course-manager/.env'
sudo sh -c 'printf "APP_HOST=%s\nAPP_ORIGIN=https://%s\nBETTER_AUTH_URL=https://%s\n" "<FQDN>" "<FQDN>" "<FQDN>" >> /opt/course-manager/.env'
sudo sh -c 'printf "BACKUP_AGE_RECIPIENT=%s\n" "<age1… public key from step 1.6>" >> /opt/course-manager/.env'
```

The other variables (NIM, Resend, healthchecks.io, Blob, image tag) are added by the tickets that need them.

**Store an offline copy now** of the `DATA_ENCRYPTION_KEY` line, next to the backup key from Step 1.6:

```bash
sudo grep '^DATA_ENCRYPTION_KEY=' /opt/course-manager/.env
```

Copy the output into your password manager, then clear your terminal. Without this key, a rebuilt VM can't read stored message text, and WhatsApp has to be re-linked.

**Check:**

```bash
sudo stat -c '%a %U %n' /opt/course-manager/.env
sudo awk -F= '{print $1}' /opt/course-manager/.env
```

**Expected:** `600 root /opt/course-manager/.env`, and these variable names (values are not printed): `DATA_ENCRYPTION_KEY`, `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `APP_HOST`, `APP_ORIGIN`, `BETTER_AUTH_URL`, `BACKUP_AGE_RECIPIENT`.

---

## Part 3: sign-off

Tick these in issue #2. They match its acceptance criteria.

- [ ] The VM is `Standard_B1s`, Ubuntu 24.04, running, with the FQDN recorded (1.4).
- [ ] Only inbound ports 22, 80 and 443 are allowed (1.5).
- [ ] SSH works by key, and a password login is refused (2.1).
- [ ] A 1 GB swap file survives a reboot; Docker and Compose work; `age` and `unattended-upgrades` are installed and enabled (2.2–2.4).
- [ ] `/opt/course-manager/.env` is mode 600, owned by root, with the generated secrets (2.5).
- [ ] **Offline copies are stored**: `backup.agekey` (1.6) and `DATA_ENCRYPTION_KEY` (2.5). The product owner confirms this in the issue.
- [ ] The public IP cost is recorded (1.8).

## Teardown (only if you need to start over)

This permanently deletes the VM, its disk and its IP. It can't be undone:

```bash
az group delete --name "$RG" --yes
```

## Added by later tickets

- **#3 (M0 spike):** `AI_EVAL_DIR` on the laptop, and the spike's data folder on the VM.
- **#5 (walking skeleton):** a GHCR login on the VM, and the `IMAGE_TAG`, `DATABASE_URL` and Resend variables.
- **#9 (reminders):** register the Resend account with your Gmail; Resend API key; Gmail filter ("Never send it to Spam", label "Course-manager").
- **#10 (health and backups):**
  - the Blob storage account and its `backups` container, with a 7-day lifecycle rule and a write-only SAS (`BACKUP_CONTAINER_URL`, `BACKUP_SAS`);
  - the three healthchecks.io checks;
  - the backup crontab, `30 20 * * *` UTC;
  - the monthly backup download reminder.
