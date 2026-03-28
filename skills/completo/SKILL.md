---
name: completo
description: |
  Manage Completo kanban board cards from the command line. Use this skill whenever the user asks to
  fetch a ticket, get the next task, pick up work, work on a card, move a card between statuses,
  create a new card or ticket, update a card's description or checklist, list or filter cards,
  or interact with their Completo board programmatically.
  Also trigger when the user says things like "grab the next ticket", "work on TK-27", "pull from
  backlog", "what's next", "start on the next card", "move this to review", "update the card",
  "create a ticket for this", "add a card", "file a bug", or "list the backlog".
  This skill requires the `completo` CLI to be installed and configured.
---

# Completo Agent Workflow

Interact with a Completo kanban board to fetch, plan, implement, and complete cards.

## Prerequisites

Before using any `completo` command, verify the CLI is available:

```bash
completo version
```

If the command is not found, tell the user:

> The `completo` CLI is not installed. Install it with:
> ```bash
> curl -fsSL https://raw.githubusercontent.com/scalecommerce-dev/completo/main/install.sh | sh
> ```
> Then configure it:
> ```bash
> completo config
> ```

If the command exists but returns a config error, tell the user to run `completo config`.

## Configuration

The CLI reads from two config files:

- **`~/.completo/.env`** - User credentials (URL, API token, email)
- **`.completo`** - Project-specific settings (committed to repos that use Completo)

Example `.completo` file:
```env
PROJECT=my-saas-app
TODO_STATUS=To Do
IN_PROGRESS_STATUS=In Progress
HANDOFF_STATUS=Review
INSTRUCTIONS=Create feature branches named <ticket-id>-<slug>. Run tests before handing off.
```

If a `.completo` file exists in the working directory (or any parent), read the `INSTRUCTIONS` field and follow them throughout the workflow.

For local development, a `.completo.local` file (gitignored) can be placed alongside `.completo` to override credentials (e.g. point at `http://localhost:3000`). You can also use `--env-file path/to/env` on any command for one-off overrides. Precedence: `~/.completo/.env` → `.completo` → `.completo.local` → `--env-file` → env vars.

## Workflow: Pick Up and Complete a Card

### Step 1: Fetch the card

Either fetch a specific card:
```bash
completo get TK-27
```

Or fetch the next card from a status (defaults to "To Do"):
```bash
completo next
completo next --status "Backlog"
```

To see all cards in the status (useful for picking quick wins):
```bash
completo next --all
```

This returns a table of all cards in the status, letting you scan for quick wins rather than blindly taking the top card. For example, an agent asked "what's a quick thing to implement?" can fetch the full list, analyze titles and priorities, and pick the simplest task.

Read the card output carefully - the title, description, tags, and priority tell you what to implement. If the description contains checklist items (`- [ ]` / `- [x]`), treat them as your implementation plan.

### Step 2: Assign yourself and move to In Progress

```bash
completo assign TK-27 --me
completo move TK-27 "In Progress"
```

The status name must match exactly. Run `completo statuses` to see available statuses if unsure. Use the `IN_PROGRESS_STATUS` from `.completo` if set.

### Step 3: Plan before implementing

Tickets are often written by non-technical users, product managers, or as quick notes — they may lack architectural context, have unclear scope, or suggest an approach that doesn't fit the codebase. Don't blindly implement what the ticket says. Think critically and align with the user first.

**Review the ticket** and share your assessment with the user:
- Is the scope clear? Are there ambiguities or missing details?
- Does the proposed approach make sense given the codebase architecture?
- Are there simpler alternatives or better ways to solve the underlying problem?
- What are the potential impacts (other features, performance, breaking changes)?
- If the ticket has a checklist, are the items complete and in a sensible order?
- **Are the dependencies in place?** Check whether the APIs, endpoints, data models, or infrastructure the ticket assumes actually exist. If the clean implementation path isn't available and you'd need a workaround, flag it. The user may prefer to fix the root cause first (e.g., add a missing API endpoint) rather than build on a hacky foundation.

**For bug tickets, reproduce first.** Before proposing a fix, try to reproduce the bug using the steps in the ticket. Run the app, trigger the described behavior, and confirm the issue exists. This prevents wasted effort on bugs that were already fixed, are environment-specific, or stem from a misunderstanding. If you cannot reproduce the bug:
- Report what you tried and what you observed instead.
- Ask the user how to proceed — they may have additional context, want to reassign the ticket to the reporter, or close it as not reproducible.
- Do not guess at a fix for a bug you can't see.

**Discuss with the user.** Present your assessment concisely — what you'd do, what concerns you have, and any alternatives worth considering. Let the user weigh in before you start coding. If the ticket is straightforward and you have no concerns, say so briefly and confirm you're ready to proceed.

**Then implement** with the agreed approach. Use plan mode for non-trivial work. Do NOT update the ticket description during implementation — that happens later after the user reviews.

### Step 4: Hand off for review

This step has a strict sequence — do each action in order, don't skip ahead.

**4a. Move the card to review FIRST, before anything else:**
```bash
completo move TK-27 "Review"
```
Use the `HANDOFF_STATUS` from `.completo` if set. If that status doesn't exist, try "Review" as a fallback. Run `completo statuses` to check what's available. The card must be in the review status before you present your summary — the user may want to test immediately.

**4b. Summarize your work** to the user. Explain what you implemented and list any ticket updates that should be made (e.g. checklist items to check off, description changes). Do NOT update the ticket description or checklist yourself yet.

**4c. Ask the user to review.** Something like:
> I've moved CF-97 to Review. Here's what I did: [summary]. The ticket needs these updates: [list changes]. Want to test first, or should I update the ticket now?

**4d. Wait for the user's feedback.** If they request changes, address them first and re-summarize. The ticket update itself happens in Step 5a (pre-commit), so you don't need separate approval for it — just make sure the user is happy with the implementation before moving on.

### Step 5: Commit and move to Done

After the user has approved and confirmed they're satisfied (e.g. "looks good", "we're done", "ship it"):

**5a. Pre-commit check — before asking to commit, consider whether the ticket needs updating:**
- If the ticket has a checklist, check off completed items.
- If the implementation went beyond the original scope (e.g. extra features, different approach), add a brief note.
- If neither applies — the work matches the description and there's no checklist — skip the update. Don't touch the ticket just for the sake of touching it.

**5b. Ask the user for permission to commit.** Do NOT commit automatically — always ask first. Something like:
> Ready to commit? I'll use the message: "Add collapsible sidebar toggle (CF-83)"

Wait for explicit approval before running `git commit`. If the user wants to adjust the message or stage specific files, follow their lead.

**5c. Commit the changes** with a clear message that includes the ticket ID:
```bash
git add <relevant-files>
git commit -m "Add collapsible sidebar toggle (CF-83)"
```

**5d. Move the card to Done:**
```bash
completo move TK-27 "Done"
```

Don't move to Done on your own — wait for explicit confirmation that the user is finished with the ticket. But also don't forget this step: once the user signals they're done, move the card immediately. A ticket left in Review after sign-off creates confusion about what still needs attention.

**Why commit here and not earlier?** During hand-off (step 4), the user tests locally via hot-reload — no commit needed. If they request changes, the agent iterates without polluting commit history. Committing at Done produces one clean, atomic commit per ticket.

## Creating Cards

Create cards directly from the CLI when the user wants to file a bug, add a task, or capture an idea without opening the UI:

```bash
completo create "Fix login timeout on slow connections"
completo create "Add CSV export" --priority high --status "Backlog"
completo create "Refactor auth middleware" --description-file /tmp/desc.md --assign-me --due 2026-04-15
```

The `create` command supports these flags:
- `--status "X"` — Status name (defaults to `TODO_STATUS` from `.completo`, or the first status)
- `--description "text"` / `--description-file path` — Card description (markdown)
- `--priority low|medium|high|urgent` — Card priority
- `--due YYYY-MM-DD` — Due date
- `--assign-me` — Assign the card to yourself
- `--project slug` — Override the project from `.completo`

After creation, the CLI prints the new ticket ID and card details.

## Available Commands

| Command | Purpose |
|---------|---------|
| `completo projects` | List accessible projects |
| `completo statuses [project]` | List statuses for a project |
| `completo next [--status "X"] [--all]` | Fetch next card (or all cards with `--all`) from a status |
| `completo list [--status "X"] [--priority P] [--assignee A]` | List cards with optional filters |
| `completo create <title> [flags]` | Create a new card with optional description, priority, due date |
| `completo get <ticket-id>` | Fetch a specific card |
| `completo move <ticket-id> "Status"` | Move card to a named status |
| `completo assign <ticket-id> --me` | Assign card to yourself |
| `completo update <ticket-id> [flags]` | Update card fields |
| `completo briefing [--file F] [--clear]` | View, upload, or clear the project's agent briefing |
| `completo my-tasks` | List cards assigned to you |
| `completo search <query>` | Search cards in project |
| `completo version` | Print CLI version |
| `completo self-update` | Update CLI to latest version |

All commands support `--json` for JSON output.

## Tips

- Status names are case-sensitive and must match exactly
- The `next` command returns the card with the lowest position (top of the column). Use `--all` to list every card in the status as a table
- Use `--description-file` for multi-line description updates instead of `--description`
- The CLI walks up directories to find `.completo`, so it works from any subdirectory
