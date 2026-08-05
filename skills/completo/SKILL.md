---
name: completo
description: |
  Manage Completo kanban board cards and projects from the command line. Use this skill whenever the
  user asks to fetch a ticket, get the next task, pick up work, work on a card, move a card between
  statuses, create a new card or ticket, create a new project, update a card's description or
  checklist, list or filter cards, assign work, or interact with their Completo board programmatically.
  Also trigger when the user says things like "grab the next ticket", "work on TK-27", "pull from
  backlog", "what's next", "start on the next card", "move this to review", "update the card",
  "create a ticket for this", "add a card", "file a bug", "list the backlog", "create a project",
  or "set up a new board".
  This skill requires the `completo` CLI to be installed and configured.
---

# Completo Agent Workflow

Fetch, plan, implement, and complete Completo cards from the command line.

## What Completo is (mental model)

Completo is a kanban app. You'll interact with it entirely through the `completo` CLI, which talks
to a remote server. A few facts shape everything below — internalize them and you'll avoid the
common mistakes:

- **Cards live in a project and have a status.** A card is `{projectKey}-{id}` (e.g. `TK-42`). The
  numeric part auto-increments per project.
- **Boards and lists are *views*, not owners.** Moving or removing a card from a view doesn't delete
  it. You never manipulate views from the CLI — you move cards between *statuses*.
- **Statuses are per-project and case-sensitive.** `"In Progress"` ≠ `"in progress"`. When unsure,
  run `completo statuses` — never guess a status name.
- **"Done" cards get filtered out after a retention window**, not deleted. So `next`/`list` won't
  surface old completed cards; that's expected, not a bug.
- **The workflow is a pipeline**, typically: `Backlog → To Do → In Progress → Review → Done`. Your
  job is usually to pull a card in, do the work, and walk it rightward with the user's sign-off at
  the handoffs.

## Setup check

Before anything else, confirm the CLI works:

```bash
completo version
```

- **Command not found** → tell the user to install it:
  > ```bash
  > curl -fsSL https://raw.githubusercontent.com/scalecommerce-dev/completo/main/install.sh | sh
  > completo config
  > ```
- **Config error** → tell the user to run `completo config`.

### Configuration (for reference)

The CLI reads credentials from `~/.completo/.env` and project settings from a `.completo` file in
the repo. `completo config` creates the credentials file interactively; you rarely need to touch
these by hand. The keys, in case you do:

```env
# ~/.completo/.env — credentials (required before any command works)
COMPLETO_URL=https://completo.example.com   # instance URL, no trailing slash
COMPLETO_TOKEN=...                           # API token from your Completo profile page
COMPLETO_USER=you@example.com                # your email; powers --me / --assign-me / my-tasks

# .completo — project settings, committed to the repo
PROJECT=my-app              # project slug (find it with `completo projects`)
TODO_STATUS=To Do          # default status for `next` and new cards
IN_PROGRESS_STATUS=In Progress
HANDOFF_STATUS=Review
INSTRUCTIONS=Free-form guidance for agents — read this and follow it throughout the workflow.
```

**If a `.completo` exists in the working directory (or any parent), read its `INSTRUCTIONS` field and
follow it for the whole session.** The CLI walks up directories to find it. A gitignored
`.completo.local` can override credentials for local dev (e.g. point at `http://localhost:3000`);
`--env-file path` does the same for one-offs. Precedence: `~/.completo/.env` → `.completo` →
`.completo.local` → `--env-file` → env vars.

## Workflow: pick up and complete a card

### Step 1 — Fetch the card

```bash
completo get TK-27              # a specific card
completo next                  # top card of TODO_STATUS (lowest position)
completo next --status Backlog # top card of another status
completo next --all            # list every card in the status as a table
```

Use `--all` when the user wants to *choose* (e.g. "what's a quick win?") — scan titles and priorities
and pick, rather than blindly taking the top card. Read the card carefully: title, description, tags,
and priority tell you what to build. **Checklist items (`- [ ]` / `- [x]`) in the description are your
implementation plan.**

### Step 2 — Claim it

```bash
completo assign TK-27 --me
completo move TK-27 "In Progress"
```

Use the `.completo` `IN_PROGRESS_STATUS` if set. Status names must match exactly — `completo statuses`
lists them.

### Step 3 — Plan before implementing

Tickets are often written by non-technical users or as quick notes — they may lack context, have
unclear scope, or suggest an approach that doesn't fit the codebase. **Don't blindly implement.**
Review the ticket and share a concise assessment with the user:

- Is the scope clear? Any ambiguities or missing details?
- Does the proposed approach fit the codebase? Are there simpler alternatives?
- What could this impact (other features, performance, breaking changes)?
- **Are the dependencies actually in place?** Check that the APIs, endpoints, or data models the
  ticket assumes exist. If the clean path isn't available and you'd need a hack, flag it — the user
  may prefer to fix the root cause first.

**For bugs, reproduce first.** Run the app, trigger the described behavior, confirm it's real before
proposing a fix. This avoids wasted effort on already-fixed, environment-specific, or misunderstood
bugs. If you can't reproduce it, report what you tried and ask how to proceed — don't guess at a fix
for a bug you can't see.

If the ticket is straightforward and you have no concerns, say so briefly and proceed. Otherwise, let
the user weigh in before you code. Use plan mode for non-trivial work. **Don't update the ticket
during implementation** — that happens after review.

### Step 4 — Hand off for review

Strict sequence — do each in order:

1. **Move the card first**, before anything else:
   ```bash
   completo move TK-27 "Review"
   ```
   Use `HANDOFF_STATUS` from `.completo` (fall back to "Review"). The card must be in review before you
   summarize, so the user can test immediately.
2. **Summarize** what you implemented and *list* any ticket updates that should be made (checklist
   items to tick, description tweaks) — but don't apply them yet.
3. **Ask the user to review**, e.g.: *"Moved TK-27 to Review. Here's what I did: […]. The ticket needs
   these updates: […]. Want to test first, or should I update the ticket now?"*
4. **Wait for feedback.** If they want changes, address them and re-summarize.

### Step 5 — Commit and move to Done

Only after the user has approved ("looks good", "ship it"):

1. **Update the ticket if warranted** — tick off completed checklist items; note if the work went
   beyond the original scope. If the work matches the description and there's no checklist, skip this —
   don't touch the ticket just to touch it.
2. **Ask permission to commit** — never commit automatically. Propose the message, e.g.: *"Ready to
   commit? Message: 'Add collapsible sidebar toggle (TK-83)'"*
3. **Commit** with the ticket ID in the message:
   ```bash
   git add <relevant-files>
   git commit -m "Add collapsible sidebar toggle (TK-83)"
   ```
4. **Move to Done:**
   ```bash
   completo move TK-27 "Done"
   ```

Don't move to Done on your own — but once the user signals they're finished, do it promptly. A card
left in Review after sign-off creates confusion about what still needs attention.

**Why commit at Done, not earlier?** During handoff the user tests via hot-reload — no commit needed.
If they request changes, you iterate without polluting history. Committing at Done yields one clean,
atomic commit per ticket.

## Creating cards

```bash
completo create "Fix login timeout on slow connections"
completo create "Add CSV export" --priority high --status Backlog
completo create "Refactor auth" --description-file /tmp/desc.md --assign-me --due 2026-04-15
```

Defaults to `TODO_STATUS` (or the first status). Flags: `--status`, `--description` /
`--description-file`, `--priority low|medium|high|urgent`, `--due YYYY-MM-DD`, `--assign-me`,
`--project`. Use `--description-file` for multi-line markdown.

## Creating projects

```bash
completo project-create "Client Portal" --slug client-portal --key CP --description "Customer dashboard"
```

**Always pass `--slug`** — omit it and the CLI appends a random suffix (`client-portal-ffab90e6`).
Derive it by lowercasing the name and hyphenating. Other flags: `--key` (2–5 uppercase letters,
auto-generated if omitted), `--icon`, `--done-retention-days` (default 30). New projects come with
default statuses (Backlog, To Do, In Progress, Review, Done), tags (Bug, Feature, Discuss), and an
Overview board. After creation, add a `.completo` with the printed slug (see Configuration above).

## Command reference

Run `completo <command> --help` for full, always-current flag lists. The essentials:

| Command | Purpose |
|---------|---------|
| `completo projects` | List accessible projects |
| `completo statuses [project]` | List a project's statuses (names are exact) |
| `completo next [project] [--status X] [--all]` | Top card of a status, or all of them (`--all`) |
| `completo list [project] [--status] [--priority] [--assignee] [--limit]` | List/filter cards (limit default 50, max 200) |
| `completo get <ticket-id>` | Fetch one card |
| `completo create <title> [flags]` | Create a card (see above) |
| `completo update <ticket-id> [flags]` | Edit `--title` / `--description[-file]` / `--priority` / `--due` (`--due none` clears it) |
| `completo move <ticket-id> "Status"` | Move a card to a status (to the top of the column) |
| `completo assign <ticket-id> --me` | Assign to yourself, or `completo assign <ticket-id> someone@example.com` for another member |
| `completo my-tasks` | Cards assigned to you |
| `completo search <query>` | Search cards in the project |
| `completo project-create <name> [flags]` | Create a project (see above) |
| `completo briefing [--file F ...] [--clear]` | View / upload / clear the project's AI briefing |
| `completo config` / `version` / `self-update` | Configure credentials / print version / update the CLI |

Read commands (`get`, `list`, `next`, `search`, `my-tasks`, `statuses`, `projects`, `create`,
`project-create`, `briefing`) accept `--json` for machine-readable output; `--env-file` overrides
config on any command.

## Notes

- `update` can only change title/description/priority/due. Use `move` for status and `assign` for
  assignee — not `update`.
- `next`, `list`, and `briefing` take an optional positional project slug if you're not relying on
  `.completo`.
- To scope work to a project without a `.completo` file, pass `--project` (on `create`) or the
  positional slug (elsewhere).
