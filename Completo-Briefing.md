# Completo — Project Context for AI Ticket Writing

Completo is a self-hosted Kanban board app for small teams — a lightweight alternative to Trello and Linear. Built with Nuxt 4, Nuxt UI 4, Tailwind 4, Drizzle ORM, and SQLite. Includes a Go CLI for terminal/agent integration. Deployed as a single Docker container.

## Domain Model

```
User ── has many ── ProjectMemberships (role: owner | member)
  └── has many ── ApiTokens, Notifications, MyTasksColumns

Project ── has many ── Statuses, Cards, Tags, Members, Boards, Lists, Invitations
  ├── doneStatusId → optional reference to a Status (for done-card filtering)
  └── briefing → markdown context for AI features (this document)

Card ── belongs to ── Project + Status
  ├── has many ── Tags (many-to-many via CardTags), Attachments
  ├── assigneeId → optional User reference
  ├── priority: low | medium | high | urgent
  ├── dueDate, description (markdown), position (integer sort order)
  └── id: INTEGER AUTOINCREMENT (displayed as "{projectKey}-{id}", e.g. TK-42)

Status ── belongs to ── Project
  └── has color; used as columns on boards

Board ── a Kanban *view* of a project's cards
  └── links to Statuses via BoardColumns (junction table with position)

List ── a table *view* of a project's cards
  └── configures visible fields via ListColumns (field name + position)

Tag ── belongs to ── Project; has name + color
Attachment ── belongs to ── Card; file upload with metadata

AI Skill ── global prompt templates for card description generation
```

**Key invariant:** Boards and Lists are *views* — they don't own cards. Removing a column from a board just unlinks the view; cards survive. Deleting a Status cascades and removes its cards.

## Workflow & Lifecycle

Default statuses (configurable per project):

```
Backlog → To Do → In Progress → Review → Done
```

- **Backlog:** Ideas and unrefined work, not yet prioritized
- **To Do:** Prioritized and ready to pick up
- **In Progress:** Actively being worked on (assigned)
- **Review:** Implementation complete, awaiting testing/feedback
- **Done:** Completed. Filtered from views after the project's retention period (not deleted from the database). Card counts in the UI exclude the Done status.

Cards move between statuses via drag-and-drop on boards, dropdown selection in list/detail views, or the CLI (`completo move TK-42 "Review"`).

## User Roles & Permissions

- **Project roles:** `owner` and `member` (per-project via projectMembers table)
- **System admin:** `isAdmin=1` flag on users; bypasses membership checks with a synthetic `{ role: 'owner' }`. Exception: "My Tasks" view is NOT admin-elevated.
- **Access control:** Non-members get 404 (not 403) to avoid leaking resource existence.
- **IDOR prevention:** Every card/tag/board endpoint validates the resource belongs to the correct project.
- **Invitations:** Project owners can invite by email. Invitations have a token and expiry. Domain allowlist restricts self-registration only — invitations bypass it.
- **Auth:** Session-based (cookie) + API tokens (Bearer). Login requires verified email. OAuth supported (Google, GitHub, GitLab — optional). Password sentinels: `!oauth` = OAuth-only user, `!invited` = pending setup.

## Key Design Decisions

- **IDs:** UUIDs everywhere except cards, which use INTEGER AUTOINCREMENT for human-friendly display (`TK-42` format). Always reference cards by their display ID in tickets.
- **Positions:** Integer `position` field on cards, columns, list columns. New items get `max(existing) + 1`.
- **Done retention:** Projects can set `doneStatusId` + `doneRetentionDays`. Views filter out old done cards (they're not deleted). `null` retention = keep forever.
- **Soft delete:** Not used. Deletes are hard deletes with cascade.
- **Card descriptions:** Markdown. AI can generate or improve descriptions using project briefing as context.
- **Notifications:** In-app only. Types: card_assigned, member_added, role_changed, member_removed, mentioned.
- **Email:** Optional (SMTP). Used for verification, invitations, password reset. Disabled if `SMTP_HOST` is empty.

## Tech Stack & Architecture

- **Monolith:** Single deployable unit (Docker container) — no microservices, no external dependencies beyond SQLite
- **Frontend:** Nuxt 4 (SPA mode, SSR disabled), Nuxt UI 4 components, Tailwind 4, Vue 3 Composition API
- **Backend:** Nuxt server routes (Nitro), Drizzle ORM, SQLite (single file database)
- **API:** REST, project-scoped endpoints nested under `/api/projects/[id]/...`. Card endpoints validate resources belong to the correct project (IDOR prevention).
- **Frontend patterns:** Composables follow `useXxx()` naming. `useViewData()` is the shared base for board/list views; `useKanban()` and `useListView()` extend it. `useMutation()` wraps try/catch/toast error handling. Pages use `useFetch()`, composables use `$fetch()`.
- **CLI:** Go (Cobra), communicates via REST API with Bearer token auth. Commands map to API endpoints (get, list, create, move, assign, search, briefing).
- **Fonts:** Plus Jakarta Sans (body), JetBrains Mono (code/IDs). Icons: Lucide (`i-lucide-*`)
- **AI:** Supports Anthropic, OpenAI, or OpenRouter for card description generation. Optional — disabled if no provider configured.
- **File storage:** Local filesystem (configurable upload directory)

## UI/UX Conventions

- **Aesthetic:** "Trello meets Linear" — indigo-violet primary palette, zinc neutrals
- **Priority icons:** `alert-circle` (urgent/red), `chevron-up` (high/orange), `grip-horizontal` (medium/indigo), `chevron-down` (low/slate)
- **Due dates:** Red = overdue, orange = due today/tomorrow, slate = future
- **Ticket IDs:** `{projectKey}-{cardId}` displayed above card title, monospace font, copyable
- **Destructive actions:** Require type-name-to-confirm for views/projects; simple confirm for cards
- **Views:** Boards (Kanban columns) and Lists (sortable tables) are both configurable via a settings modal with filters for status, priority, assignee, and tags

## Terminology

| Term | Meaning |
|------|---------|
| **Card** | A work item / task / ticket. Called "card" in UI, referenced by ticket ID (e.g. `TK-42`) in CLI |
| **Status** | Workflow state (e.g. Backlog, To Do, In Progress, Review, Done). Project-scoped |
| **Board** | Kanban view — shows cards as draggable cards in status columns |
| **List** | Table view — shows cards as rows with configurable field columns |
| **Board column** | Links a Status to a Board (position + visibility). Junction table |
| **List column** | Which card field to show in a List table (e.g. title, priority, dueDate) |
| **Project key** | 2-5 uppercase letter code (e.g. `TK`, `WR`). Used in ticket IDs |
| **Briefing** | This document — markdown project context for AI features |
| **AI Skill** | Reusable prompt template for card description generation (admin-managed) |
| **Done retention** | How many days to keep done cards visible before filtering them from views |

## Ticket Conventions

Tickets in Completo use markdown descriptions. Common categories:

- **Feature:** New capability or enhancement. Use acceptance criteria as a checkbox list.
- **Bug fix:** Include "Steps to reproduce", "Expected behavior", "Actual behavior" sections.
- **CLI addition:** New CLI command or flag. Mention the command syntax and expected output.
- **UI enhancement:** Describe the visual change and affected views (board, list, modal, detail page).
- **Refactor:** Describe the current problem and the target state. No checklist needed — scope is the description itself.

**Acceptance criteria** use markdown checklists (`- [ ]`). Each item should be independently verifiable. Reference specific UI elements, composables, or API endpoints by name when it aids clarity.

Tickets should NOT include: test instructions, migration steps, or file paths. Those are implementation details for the developer, not the ticket.

## Example Tickets

### Feature ticket
**Title:** Add card archiving as alternative to deletion
**Description:**
Users should be able to archive cards instead of permanently deleting them. Archived cards are hidden from all views but can be restored.

- [ ] Add `archivedAt` timestamp field to cards table
- [ ] Archived cards are excluded from board and list views (same pattern as done retention filtering)
- [ ] Add "Archive" option to card modal and detail page (replaces or sits alongside "Delete")
- [ ] Add "Archived Cards" section in project settings to browse and restore archived cards
- [ ] CLI `completo list --archived` flag to include archived cards

### Bug fix ticket
**Title:** Non-member admin sees empty My Tasks despite having cards assigned
**Description:**
## Steps to reproduce
1. Log in as a system admin (`isAdmin=1`) who is not a member of any project
2. Have another user assign a card to the admin
3. Navigate to My Tasks

## Expected behavior
The assigned card appears in My Tasks.

## Actual behavior
My Tasks shows "No tasks assigned to you." The My Tasks view is not admin-elevated — it only shows cards from projects where the user has explicit membership.

### CLI ticket
**Title:** Add `--status` filter to `completo search`
**Description:**
The `search` command currently returns all matching cards regardless of status. Add an optional `--status` flag to filter results.

- [ ] Accept `--status "Status Name"` flag on the search command
- [ ] Resolve status name to ID using the same pattern as `next` and `list` commands
- [ ] Pass `statusId` query parameter to the search API endpoint
- [ ] Display STATUS column in search results table (currently shows TICKET, TITLE, PRIORITY only)

## Out of Scope

Completo intentionally does NOT include:
- Real-time collaboration / WebSocket sync (page refresh to see others' changes)
- Recurring or scheduled cards
- Time tracking or estimates
- Subtasks or card hierarchies
- Custom fields beyond the built-in set
- Gantt charts, roadmaps, or timeline views
- Public/guest access to boards (authentication required)
