# M0 report: go / no-go

> Template. Fill in each result as M0 runs (#3, #4). How to measure each line: `spikes/m0/README.md`.

- **Run dates:** _from … to …_
- **Baileys version tested:** `baileys@7.0.0-rc14`, the npm name the official WhiskeySockets repo publishes (same code as `@whiskeysockets/baileys`) _(update if changed)_
- **Chosen NIM model id:** _…_ (prompt `m0-draft-1` _or later_, guided JSON _yes / no_)

## Checklist (design §15)

| # | Item | Result |
|---|---|---|
| 1 | Class Representative's notice pinned in every linked group before anything was stored | |
| 2 | 7-day run: steady memory (from `memory.csv`), disconnects with reasons, messages per group per day | |
| 2 | Phone notifications still arrive (daily: day 1 … day 7) | |
| 3 | Restart test: stopped 10 min during activity; messages present after restart, delivered as `append` | |
| 4 | Edit and delete: exact event shapes and timestamps, observed passively (paste the redacted `raw_shape` lines, and check them for text and phone numbers first: this file is committed). If none was seen, the shapes from the Baileys source, marked "from source, not observed" | |
| 5 | Late-link: do a newly linked group's first messages decrypt? | |
| 6 | Pairing by code at least twice, once after an unlink | |
| 7 | Test set: about 50 messages, every CONTEXT.md category, tuning and held-out halves separate, stored outside the repo | |
| 8 | nim-eval held-out: deadline-case score, overall score, score per category, tokens, latency, max daily requests and tokens | |
| 9 | Resend test email lands in Gmail Primary after the filter is set | |
| 10 | Limits: NIM free limits, terms and guided JSON; Resend free tier and `Idempotency-Key`; healthchecks.io free check count; Azure Blob free amount; public IP (about $3.65/month, recorded in #2) | |

## Go / no-go criteria

| Criterion | Bar | Measured | Met? |
|---|---|---|---|
| Worker steady memory | ≤ 300 MB | | |
| Unexplained logouts | none | | |
| Phone notifications | still arrive | | |
| Restart test | loses nothing | | |
| Held-out score | 100% deadline cases, ≥ 95% overall | | |
| Projected NIM use | within free limits | | |
| Email | lands in Primary | | |

## Decision

**_GO / NO-GO_**, decided on _date_.

A no-go goes back to the product owner before any M1a ticket starts.
