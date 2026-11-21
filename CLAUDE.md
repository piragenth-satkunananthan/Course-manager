# Course-manager

## Working agreement

The user is the product owner. Their approval gates the work.

- **Never write app code before the product owner approves the spec and its tickets.** Specs, tickets, ADR drafts and design notes are fine before approval; application code is not.
- **Ask first** before any architecture change, scope change, or production action (deploys, data migrations, changes to live infrastructure or production data).
- **Library docs**: use Context7 (`resolve-library-id` → `query-docs`) instead of relying on memory.

## Where things live

- **Requirements**: `CONTEXT.md`, ADRs in `docs/adr/`, and the spec issue on GitHub.
- **Design**: `docs/designs/`.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (piragenth-satkunananthan/Course-manager) via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
