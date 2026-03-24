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

### Step 3: Implement

Work through the card's requirements. If the description contains a checklist, update items as you complete them:

```bash
# Read current description, check off completed items, write back
completo get TK-27
# ... edit the description to mark items as [x] ...
completo update TK-27 --description-file /tmp/updated-desc.md
```

To update the description:
1. Get the current card with `completo get TK-27`
2. Copy the description, update the checklist items (`- [ ]` -> `- [x]`)
3. Write the updated description to a temp file
4. Run `completo update TK-27 --description-file /tmp/updated-desc.md`

### Step 4: Hand off

When implementation is complete, move the card to the handoff status:

```bash
completo move TK-27 "Review"
```

Use the `HANDOFF_STATUS` from `.completo` if set. If that status doesn't exist, try "Review", then "Done" as fallbacks. Run `completo statuses` to check what's available.

Do NOT move directly to the project's "Done" status - the user needs to review and test first.

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
