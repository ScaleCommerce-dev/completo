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

Generate a `Completo-Briefing.md` file that gives the remote Completo server enough context about the project to write high-quality AI-powered ticket descriptions. The remote AI cannot see the source code — this file is its only window into the project.

## Why This Exists

Completo's AI features (card description generation, improvement) use a "project briefing" as context. Developers typically have a `CLAUDE.md` or `AGENTS.md` that describes the project for local agents — but those files are optimized for agents that *can read the code*. They say things like "architecture decisions only, nothing obvious from reading the source." The remote Completo AI has no source code access, so it needs a different, more self-contained document.

The briefing serves a specific purpose: helping the AI write **ticket headlines and descriptions** — scoped work items with acceptance criteria. This means the AI needs to understand not just *what the product is*, but *how work gets done in this project*: what workflow stages exist, what a good ticket looks like, what level of detail is expected, and what conventions govern the codebase at a level that affects ticket scoping.

## When to Run This

- When setting up Completo for a new project
- When the project's architecture, domain model, or conventions change significantly
- When AI-generated card descriptions are missing context or using wrong terminology
- When the user explicitly asks to update the briefing

## Workflow

### Step 1: Explore the project

Read the project's documentation and code to understand what it does:

1. Read `CLAUDE.md`, `AGENTS.md`, `README.md`, `CONTRIBUTING.md` — whichever exist
2. Read the main config file (e.g. `package.json`, `go.mod`, `Cargo.toml`) for tech stack
3. Read the database schema or data model files to understand core entities
4. Read a few key files: entry point, route definitions, main components
5. Identify the **workflow lifecycle** — what states/statuses do work items go through?
6. Look at recent git history (`git log --oneline -20`) to understand what kinds of work happen (bug fixes, features, refactors, CLI additions)
7. Check for existing `Completo-Briefing.md` — if it exists, this is an update, not a fresh creation

### Step 2: Draft the briefing

Create `Completo-Briefing.md` in the project root. The document should be **150-300 lines** — concise but complete enough for an AI that cannot see code. The goal is a document that lets the AI write tickets indistinguishable from ones a developer who knows the project would write.

#### Required sections

**Project Summary** (3-5 lines)
What the product is, who it serves, the tech stack, and how it's deployed. One paragraph that grounds everything else.

**Domain Model** (10-30 lines)
The core entities and their relationships. This is the most important section — without it, AI will invent wrong assumptions. Use compact notation:
```
Project -> has many Statuses, Cards, Tags, Members, Boards, Lists
Card -> belongs to Project + Status; has Tags (many-to-many), Attachments
Board -> a *view* of cards; links to statuses via BoardColumns (junction)
```
Include key invariants (e.g. "boards don't own cards, removing a column doesn't delete cards").

**Workflow & Lifecycle** (5-10 lines)
The actual states that work items move through — not just that statuses exist, but what the default ones are and what each means. The AI needs this to write tickets that reference the right workflow stage. Example:
```
Default statuses: Backlog → To Do → In Progress → Review → Done
- Backlog: ideas and unrefined work
- Done: filtered from views after retention period (not deleted)
```

**User Roles & Permissions** (5-15 lines)
Who can do what. The AI needs this to write correct acceptance criteria. Include edge cases like admin overrides, guest access, or resource-level permissions.

**Key Design Decisions** (10-20 lines)
Non-obvious rules that would cause the AI to write incorrect specs if unknown. Things like:
- ID format conventions (UUIDs vs integers, display format)
- Soft delete vs hard delete behavior
- Status/lifecycle rules (e.g. "done cards are filtered, not deleted")
- Authentication model (sessions, JWT, OAuth, password rules)

**Tech Stack & Architecture** (5-15 lines)
The major frameworks, libraries, and architectural patterns. Go beyond just listing the stack — include the patterns that affect how tickets should be scoped:
- Is it a monolith or microservices? (changes how feature tickets are scoped)
- How are API endpoints structured? (e.g. "REST, nested under `/api/projects/[id]/...`")
- What are the major composable/module patterns? (e.g. "`useKanban()` and `useListView()` for views, `useMutation()` for API calls")
- Where does the CLI fit? (e.g. "Go CLI communicates via REST API, commands map 1:1 to API endpoints")

The AI doesn't need file paths, but it needs enough architectural context to scope work items correctly. "Add drag-and-drop reordering" is a very different ticket depending on whether the app uses a monolith with server-rendered HTML vs. a SPA with client-side state management.

**UI/UX Conventions** (5-10 lines, if applicable)
Design language, component library, styling approach. Focus on conventions that recur in tickets — color meanings, icon mappings, interaction patterns.

**Terminology** (5-10 lines, if the project has domain-specific jargon)
A glossary of terms the AI should use correctly. E.g. "we say 'card' not 'ticket' in the UI, but the CLI uses ticket IDs like TK-42."

**Ticket Conventions** (10-20 lines)
This section teaches the AI *how to write tickets for this project*. Include:
- Common ticket categories (bug fix, feature, refactor, CLI addition, UI enhancement)
- What acceptance criteria look like (checklist? prose? "should" statements?)
- Whether tickets should mention migration steps, test requirements, or docs updates
- How tickets reference related concepts (e.g. "mention the affected composable by name")

**Example Tickets** (15-30 lines)
Two or three example tickets that demonstrate the project's voice, scope, and structure. These are the single highest-leverage thing in the briefing — they show the AI exactly what "good" looks like. Pick examples that cover different categories (e.g. one feature, one bug fix, one refactor). Format:

```
### Example: Feature ticket
**Title:** Add tag filtering to board views
**Description:**
Board views should support filtering cards by tag. Users can select one or
more tags from a dropdown; only cards with at least one matching tag are shown.

**Acceptance criteria:**
- [ ] Add tag filter dropdown to ViewConfigModal (board mode)
- [ ] Filter applies client-side to avoid extra API calls
- [ ] Selected tags persist in the board's saved configuration
- [ ] Empty tag selection shows all cards (no filter)
```

Choose examples from real tickets if possible, or write realistic ones based on the project's actual patterns.

**Out of Scope** (5-10 lines, optional)
What the project intentionally does NOT include. This prevents the AI from writing tickets that assume features exist or suggesting approaches that conflict with project philosophy.

#### What NOT to include

- Local development setup (the remote AI never runs the project)
- How to run tests (irrelevant for ticket descriptions)
- Detailed directory structure or file-by-file listings (too granular and goes stale)
- Full API endpoint documentation (use domain model + high-level patterns instead)
- Git workflow or branching strategy
- CI/CD pipeline details
- Credentials, secrets, or environment variables

Note: high-level architectural patterns *are* valuable even though detailed file paths aren't. "Composables follow `useXxx()` naming and extend `useViewData()` for shared view logic" helps the AI scope tickets. "The composable is at `app/composables/useKanban.ts` line 42" does not.

#### Writing style

- Be concrete. Say `pnpm` not "the package manager". Say `Nuxt 4` not "a Vue framework."
- Prefer compact lists and tables over prose paragraphs
- Include real examples where they clarify (e.g. ticket ID format: `TK-42`)
- Write for an AI that is smart but has zero project context — state the obvious if it's load-bearing
- Don't explain *how* code works — explain *what things are* and *what rules govern them*
- When in doubt about whether to include something, ask: "Would an AI write a worse ticket without this?" If yes, include it.

### Step 3: Review with the user

Present the draft to the user before uploading. Highlight:
- Any sections where you made assumptions (ask for confirmation)
- Sections you intentionally omitted and why
- Whether this is a fresh briefing or an update to an existing one

### Step 4: Test the briefing quality

Before uploading, verify the briefing actually produces good results. Generate 2-3 test ticket descriptions by asking yourself: "Given only this briefing, could I write a well-scoped ticket for [specific feature/bug]?" Try:

1. A **feature ticket** touching the domain model (e.g. "add card archiving")
2. A **bug fix** involving permissions or edge cases (e.g. "non-member admin can't see My Tasks cards")
3. A **frontend ticket** involving UI conventions (e.g. "add priority badges to list view")

For each, draft a quick headline + 2-3 acceptance criteria using only information from the briefing. If you find yourself guessing or making assumptions the briefing doesn't support, that's a gap — go back and fill it in.

Share the test tickets with the user: "Here's what an AI could write from this briefing alone — does this match the quality you'd expect?"

### Step 5: Upload via CLI

After the user approves:

```bash
completo briefing --file Completo-Briefing.md
```

This uploads the file as the project's agent briefing. Verify it worked:

```bash
completo briefing | head -5
```

### Step 6: Note in project documentation

Check if `CLAUDE.md` or `AGENTS.md` exists. Add a brief note to whichever is present (prefer `CLAUDE.md`), pointing to the briefing file and this skill:

```markdown
### Completo Briefing

`Completo-Briefing.md` provides project context to Completo's AI features (card description
generation). Update it when the domain model, architecture, or conventions change significantly.
Use the `/completo-briefing` skill to regenerate it.
```

Do not add this note if it already exists.

## Updating an Existing Briefing

When updating rather than creating from scratch:

1. Read the existing `Completo-Briefing.md`
2. Read `CLAUDE.md`/`AGENTS.md` for the current state of project documentation
3. **Diff the briefing against CLAUDE.md** — look for concepts, conventions, or architectural decisions in CLAUDE.md that aren't reflected in the briefing. These are likely recent additions.
4. Check git log for significant recent changes: `git log --oneline -30`
5. Look for new database tables or schema changes: check the schema file and recent migrations
6. **Don't rewrite from scratch** — update only the sections that changed. The briefing should evolve incrementally, not be regenerated each time (this preserves any user edits to wording or emphasis).
7. Run the quality test (Step 4) on a topic related to the changes — make sure the updated briefing supports tickets in the area that changed.
8. Upload via `completo briefing --file Completo-Briefing.md`

## Tips

- The briefing is markdown. Use headers, lists, and tables — the AI parses these well.
- You can upload multiple files: `completo briefing --file Completo-Briefing.md --file domain-glossary.md`
- View the current remote briefing anytime: `completo briefing`
- Clear the briefing: `completo briefing --clear`
- The briefing is per-project. If the CLI is configured with a `.completo` file, it uses that project automatically.
- If ticket quality degrades over time, the briefing may have drifted from the codebase. Run an update.
