# M0 spikes (#3 WhatsApp listen, #4 AI evaluation)

Throwaway code. The app never imports it, and it is deleted after M0. Only `docs/m0-report.md` is kept.

**All output goes to `spikes/m0/data/`, which git ignores.** That includes the WhatsApp auth files (`data/auth/`), which are the keys to the linked device. Never commit or copy them anywhere else. Real test-set messages live in `$AI_EVAL_DIR`, outside the repo.

| File | What it does |
|---|---|
| `wa-listen.ts` | Read-only listener. Logs memory, connections, message events and edit/delete shapes, and stores linked-group text encrypted. |
| `dump-messages.ts` | `--counts`: messages per group per day (no text). Default: decrypted JSONL on stdout. |
| `nim-eval.ts` | Grades a NIM model on labelled cases (`--tune`, `--grade`, `--probe-guided`). |
| `classify.ts`, `crypto.ts`, `ops-v1.ts`, `score.ts` | The pure parts, unit-tested (`npm test`). |
| `example-case.json` | A synthetic case showing the test-set format. |

## Before anything is stored

The Class Representative has pinned the notice in **every** group you will link: messages are read and kept until the end of the Semester. Don't add a group to `data/groups.txt` until its notice is pinned.

## wa-listen on the VM (#3)

The VM has Docker but no Node, so the spike runs in a `node:22-slim` container on a clone of this repo.

```bash
# on the VM, in a clone of this repo
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app node:22-slim npm ci --ignore-scripts

sudo docker run -d --name wa-listen --restart on-failure \
  -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$PWD":/app -w /app \
  --env-file /opt/course-manager/.env -e WA_PHONE=94XXXXXXXXX \
  node:22-slim node_modules/.bin/tsx spikes/m0/wa-listen.ts

docker logs -f wa-listen     # every event is printed as one JSON line
```

`sudo` is needed only so Docker can read the root-only `.env` (the listener uses `DATA_ENCRYPTION_KEY` from it). `WA_PHONE` is your number as digits, with the country code and no `+`.

1. **Pair.** The log prints `pairing_code`. On the phone: WhatsApp → Linked devices → Link a device → *Link with phone number instead*, then type the code.
2. **Pick groups.** Once connected, `data/all-groups.tsv` lists every group's JID and name. Copy the JIDs of the class groups (one per line) into `data/groups.txt`. The listener re-reads that file every 30 s and logs `groups_loaded`. Nothing is stored before a group is listed there; every other chat is dropped inside Baileys, before decryption.
3. **Leave it running for 7 days.** It never sends messages, presence or read receipts, and `markOnlineOnConnect` is off.

### Where each result is recorded

| Check (#3) | How | Where to read it |
|---|---|---|
| Memory every 5 min | automatic | `data/memory.csv` |
| Connects and disconnects, with the reason | automatic | `event: "connection"` lines in `data/events.jsonl` |
| Message counts per group per day | automatic | `npm run spike:messages -- --counts`, on the laptop after copying the file (see below), or in the same `node:22-slim` container on the VM |
| Restart test | `docker stop wa-listen` while a group is active, wait 10 min, `docker start wa-listen` | the counts show the missed messages with type `append`; `offline_catch_up_done` marks the end of the catch-up |
| Edit and delete shapes | in a linked test group, edit one message and delete another (ideally from a classmate's phone, because ingest ignores your own messages; the shapes are logged either way) | `event: "raw_shape"` lines (text redacted to its length) |
| Late-link decryption | add a group to `groups.txt` partway through the run | its first messages in the counts, and any `decrypt_failure` lines |
| Pairing by code twice, once after an unlink | remove the device on the phone: the listener logs `logged_out`, wipes `data/auth` and stops. Run `sudo docker start wa-listen` to get a new code | `pairing_code` and `connection` lines |
| Phone notifications | check every day | write it in `docs/m0-report.md` |

### Building the test set (#4)

Copy `data/messages.enc.jsonl` to the laptop's `spikes/m0/data/` (git ignores it), then decrypt it into a folder **outside** the repo. The key is the `DATA_ENCRYPTION_KEY` you stored offline:

```bash
DATA_ENCRYPTION_KEY=… npm run spike:messages > "$AI_EVAL_DIR/raw-messages.jsonl"
npm run spike:messages -- --counts > "$AI_EVAL_DIR/counts.csv"
```

Pick about 50 messages covering every category in `CONTEXT.md` (times like "4.30", relative dates, corrections, edits and deletes, duplicates, questions and chatter, mixed English, Unknown Courses, Session Group messages, timetable changes, Semester extensions). Write one case file per thread in the `example-case.json` format, and split them into `$AI_EVAL_DIR/tuning/` and `$AI_EVAL_DIR/heldout/`.

A case is a **deadline case** when its expected operations create, update or cancel an Assignment or Exam. Titles, descriptions, topics and locations aren't compared, because their wording varies. Everything else must match exactly, ignoring the order of operations.

## nim-eval (#4)

```bash
export NIM_API_KEY=… AI_EVAL_DIR=~/course-manager-eval
npm run spike:eval -- --model meta/llama-3.3-70b-instruct --probe-guided   # guided JSON supported?
npm run spike:eval -- --model meta/llama-3.3-70b-instruct --tune           # as often as needed; edit the prompt in nim-eval.ts
npm run spike:eval -- --model meta/llama-3.3-70b-instruct --grade --counts "$AI_EVAL_DIR/counts.csv"
```

Add `--guided` to send the `ops.v1` JSON Schema, if the probe shows it's accepted. `--grade` runs the held-out half once per model, refuses a second run, and exits 1 below the bar (100% on deadline cases, at least 95% overall). Results, with token use, latency and the projected daily tokens, go to `$AI_EVAL_DIR/results/`.

## Cleaning up after M0

```bash
sudo docker rm -f wa-listen
rm -rf spikes/m0/data            # on the VM and on the laptop
```

Then remove the linked device on the phone (WhatsApp → Linked devices).
