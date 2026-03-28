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

- **Frontend:** Nuxt 4 (SPA mode, SSR disabled), Nuxt UI 4 components, Tailwind 4, Vue 3 Composition API
- **Backend:** Nuxt server routes (Nitro), Drizzle ORM, SQLite (single file database)
- **CLI:** Go (Cobra framework), communicates via REST API with Bearer token auth
- **Fonts:** Plus Jakarta Sans (body), JetBrains Mono (code/IDs). Icons: Lucide (`i-lucide-*`)
- **AI:** Supports Anthropic, OpenAI, or OpenRouter for card description generation. Optional — disabled if no provider configured.
- **File storage:** Local filesystem (configurable upload directory)
- **Monolith:** Single deployable unit — no microservices, no external dependencies beyond SQLite

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

## Out of Scope

Completo intentionally does NOT include:
- Real-time collaboration / WebSocket sync (page refresh to see others' changes)
- Recurring or scheduled cards
- Time tracking or estimates
- Subtasks or card hierarchies
- Custom fields beyond the built-in set
- Gantt charts, roadmaps, or timeline views
- Public/guest access to boards (authentication required)
