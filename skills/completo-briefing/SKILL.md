---
name: completo-briefing
description: |
  Generate or update a Completo-Briefing.md file that provides project context to the remote
  Completo server for AI-powered ticket description generation. Use this skill whenever the user
  asks to create, update, or sync a project briefing, generate context for Completo's AI features,
  or says things like "update the briefing", "sync context to Completo", "generate project context",
  "refresh the AI briefing", or "create a Completo briefing". Also trigger when the user mentions
  that AI-generated card descriptions are missing context or are low quality — the briefing may
  need updating. This skill requires the `completo` CLI to be installed and configured.
---

# Completo Briefing Generator

Generate a `Completo-Briefing.md` that gives the **remote** Completo server enough context to write
high-quality AI ticket descriptions. The remote AI **cannot see the source code** — this file is its
only window into the project.

## Why this is different from CLAUDE.md

`CLAUDE.md`/`AGENTS.md` are written for local agents that *can read the code* — so they deliberately
skip anything "obvious from the source." The remote AI has no such access, so the briefing must be
**self-contained**. Its specific job is helping the AI write **ticket headlines and descriptions** —
scoped work items with acceptance criteria. That means it needs to understand not just *what the
product is* but *how work gets done here*: the workflow stages, what a good ticket looks like, and the
conventions that affect how work is scoped.

## When to run

Setting up a new project · after significant architecture/domain/convention changes · when AI card
descriptions use wrong terminology or miss context · when the user explicitly asks.

## Step 1 — Explore the project

Read enough to describe the project to someone who can't see the code:

1. `CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md` — whichever exist
2. The main manifest (`package.json`, `go.mod`, `Cargo.toml`, …) for the tech stack
3. The database schema / data model files → the core entities
4. A few key files: entry point, route definitions, main components
5. The **workflow lifecycle** — what states do work items move through?
6. `git log --oneline -20` → what kinds of work happen (features, bugs, refactors, CLI, …)
7. Any existing `Completo-Briefing.md` — if present, this is an **update** (see the last section), not
   a rewrite

## Step 2 — Draft the briefing

Write `Completo-Briefing.md` in the project root, **150–300 lines** — concise but complete enough that
the AI writes tickets indistinguishable from a developer who knows the project. Prefer compact lists
and tables over prose. Be concrete: `pnpm` not "the package manager", `Nuxt 4` not "a Vue framework".

### Sections

Each section earns its place by answering: *"Would the AI write a worse ticket without this?"* If yes,
include it.

- **Project Summary** (3–5 lines) — what the product is, who it serves, the stack, how it's deployed.
  One grounding paragraph.
- **Domain Model** (10–30 lines) — **the most important section.** Core entities, relationships, and
  invariants. Without it the AI invents wrong assumptions. Use compact notation:
  ```
  Project -> has many Statuses, Cards, Tags, Members, Boards, Lists
  Card    -> belongs to Project + Status; has Tags (many-to-many), Attachments
  Board   -> a *view* of cards; links to statuses via BoardColumns (junction)
  ```
  Include invariants ("boards don't own cards; removing a column doesn't delete cards").
- **Workflow & Lifecycle** (5–10 lines) — the actual default states and what each means, so tickets
  reference the right stage. E.g. `Backlog → To Do → In Progress → Review → Done`, plus notes like
  "Done cards are filtered from views after retention, not deleted".
- **User Roles & Permissions** (5–15 lines) — who can do what, including edge cases (admin overrides,
  guest access, resource-level rules). The AI needs this for correct acceptance criteria.
- **Key Design Decisions** (10–20 lines) — non-obvious rules that would make the AI write wrong specs:
  ID formats (UUID vs integer, display format), soft vs hard delete, lifecycle rules, auth model.
- **Tech Stack & Architecture** (5–15 lines) — frameworks *and* the patterns that affect scoping:
  monolith vs microservices, how endpoints are structured, major module/composable patterns, where a
  CLI fits. "Add drag-and-drop reordering" is a very different ticket in a server-rendered monolith vs.
  a SPA with client state. Include architecture, not file paths.
- **UI/UX Conventions** (5–10 lines, if applicable) — design language, component library, recurring
  conventions (color meanings, icon mappings, interaction patterns).
- **Terminology** (5–10 lines, if there's jargon) — a glossary so the AI uses terms correctly (e.g.
  "the UI says 'card', the CLI uses ticket IDs like `TK-42`").
- **Ticket Conventions** (10–20 lines) — how to write tickets *here*: common categories (bug, feature,
  refactor, CLI, UI), what acceptance criteria look like (checklist? prose? "should" statements?),
  whether to mention migrations/tests/docs, how tickets reference related concepts.
- **Example Tickets** (15–30 lines) — **the single highest-leverage part.** Two or three real (or
  realistic) tickets covering different categories; they show the AI exactly what "good" looks like:
  ```
  ### Example: Feature ticket
  **Title:** Add tag filtering to board views
  **Description:**
  Board views should support filtering cards by tag. Users select one or more tags from a
  dropdown; only cards with at least one matching tag are shown.

  **Acceptance criteria:**
  - [ ] Add tag filter dropdown to ViewConfigModal (board mode)
  - [ ] Filter applies client-side to avoid extra API calls
  - [ ] Selected tags persist in the board's saved configuration
  - [ ] Empty selection shows all cards (no filter)
  ```
- **Out of Scope** (5–10 lines, optional) — what the project intentionally does *not* do, so the AI
  doesn't assume missing features or suggest conflicting approaches.

### Don't include

Local dev setup · how to run tests · directory listings / file-by-file detail (goes stale) · full API
endpoint docs (use the domain model + high-level patterns instead) · git/branching workflow · CI/CD ·
credentials or env vars. The rule of thumb: high-level patterns help ("composables follow `useXxx()`
and extend `useViewData()`"); exact file paths don't ("it's at `app/composables/useKanban.ts:42`").

Write for an AI that's smart but has zero project context — state the load-bearing obvious. Explain
*what things are* and *what rules govern them*, not *how the code works*.

## Step 3 — Review with the user

Show the draft before uploading. Flag any assumptions you made (ask to confirm), sections you
intentionally omitted, and whether this is a fresh briefing or an update.

## Step 4 — Test the briefing quality

Before uploading, prove it works. Using **only the briefing**, draft a quick headline + 2–3 acceptance
criteria for each of:

1. A **feature** touching the domain model (e.g. "add card archiving")
2. A **bug** involving permissions/edge cases (e.g. "non-member admin can't see My Tasks cards")
3. A **frontend** ticket involving UI conventions (e.g. "add priority badges to list view")

If you catch yourself guessing something the briefing doesn't support, that's a gap — fill it. Then
show the user: *"Here's what an AI could write from this briefing alone — is this the quality you'd
expect?"*

## Step 5 — Upload

```bash
completo briefing --file Completo-Briefing.md   # after the user approves
completo briefing | head -5                      # verify it took
```

The briefing is per-project (uses the `.completo` project automatically). You can upload multiple
files — `--file a.md --file b.md` concatenates them. View the current one anytime with
`completo briefing`; clear it with `completo briefing --clear`.

## Step 6 — Note it in project docs

If `CLAUDE.md` (preferred) or `AGENTS.md` exists and doesn't already mention this, add:

```markdown
### Completo Briefing

`Completo-Briefing.md` provides project context to Completo's AI features (card description
generation). Update it when the domain model, architecture, or conventions change significantly.
Use the `/completo-briefing` skill to regenerate it.
```

## Updating an existing briefing

Don't rewrite from scratch — evolve it incrementally so user edits to wording survive:

1. Read the existing `Completo-Briefing.md` and current `CLAUDE.md`/`AGENTS.md`.
2. **Diff the briefing against CLAUDE.md** — concepts/decisions in CLAUDE.md but missing from the
   briefing are likely recent additions.
3. Check `git log --oneline -30` and recent schema/migration changes for new entities.
4. Update only the sections that changed.
5. Run the Step 4 quality test on a topic in the changed area.
6. Re-upload with `completo briefing --file Completo-Briefing.md`.

If ticket quality has degraded over time, the briefing has probably drifted from the codebase — run an
update.
