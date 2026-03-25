---
name: completo
description: |
  Manage Completo kanban board cards from the command line. Use this skill whenever the user asks to
  fetch a ticket, get the next task, pick up work, work on a card, move a card between statuses,
  update a card's description or checklist, or interact with their Completo board programmatically.
  Also trigger when the user says things like "grab the next ticket", "work on TK-27", "pull from
  backlog", "what's next", "start on the next card", "move this to review", or "update the card".
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

**Discuss with the user.** Present your assessment concisely — what you'd do, what concerns you have, and any alternatives worth considering. Let the user weigh in before you start coding. If the ticket is straightforward and you have no concerns, say so briefly and confirm you're ready to proceed.

**Then implement** with the agreed approach. Use plan mode for non-trivial work. Do NOT update the ticket description during implementation — that happens later after the user reviews.

### Step 4: Hand off

When implementation is complete:

1. **Move the card** to the handoff status:
   ```bash
   completo move TK-27 "Review"
   ```
   Use the `HANDOFF_STATUS` from `.completo` if set. If that status doesn't exist, try "Review", then "Done" as fallbacks. Run `completo statuses` to check what's available.

2. **Summarize your work** to the user. Explain what you implemented and list any ticket updates that should be made (e.g. checklist items to check off, description changes). Do NOT update the ticket description or checklist yourself.

3. **Ask the user to review.** Something like:
   > Here's what I've done: [summary]. The ticket needs the following updates: [list changes]. Want to test first, or should I go ahead and update the ticket?

4. **Wait for confirmation.** Only update the ticket (checklist, description) after the user explicitly tells you to. If they give feedback instead, address it first, then ask again.

Do NOT move directly to the project's "Done" status — the user needs to review and test first. Do NOT update the ticket description or checklist without the user's go-ahead.

## Available Commands

| Command | Purpose |
|---------|---------|
| `completo projects` | List accessible projects |
| `completo statuses [project]` | List statuses for a project |
| `completo next [--status "X"]` | Fetch next card from a status |
| `completo get <ticket-id>` | Fetch a specific card |
| `completo move <ticket-id> "Status"` | Move card to a named status |
| `completo assign <ticket-id> --me` | Assign card to yourself |
| `completo update <ticket-id> [flags]` | Update card fields |
| `completo my-tasks` | List cards assigned to you |
| `completo search <query>` | Search cards in project |
| `completo version` | Print CLI version |
| `completo self-update` | Update CLI to latest version |

All commands support `--json` for JSON output.

## Tips

- Status names are case-sensitive and must match exactly
- The `next` command returns the card with the lowest position (top of the column)
- Use `--description-file` for multi-line description updates instead of `--description`
- The CLI walks up directories to find `.completo`, so it works from any subdirectory
