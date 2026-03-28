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

Completo's AI features (card description generation, improvement) use a "project briefing" as context. Developers typically have a `CLAUDE.md` or `AGENTS.md` that describes the project for local agents — but these files are optimized for agents that *can read the code*. They say things like "architecture decisions only, nothing obvious from reading the source." The remote Completo AI has no source code access, so it needs a different, more self-contained document.

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
5. Check for existing `Completo-Briefing.md` — if it exists, this is an update, not a fresh creation

### Step 2: Draft the briefing

Create `Completo-Briefing.md` in the project root. The document should be **100-200 lines** — concise but complete enough for an AI that cannot see code. It has a specific structure optimized for ticket description generation.

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

**User Roles & Permissions** (5-15 lines)
Who can do what. The AI needs this to write correct acceptance criteria. Include edge cases like admin overrides, guest access, or resource-level permissions.

**Key Design Decisions** (10-20 lines)
Non-obvious rules that would cause the AI to write incorrect specs if unknown. Things like:
- ID format conventions (UUIDs vs integers, display format)
- Soft delete vs hard delete behavior
- Status/lifecycle rules (e.g. "done cards are filtered, not deleted")
- Authentication model (sessions, JWT, OAuth, password rules)

**Tech Stack & Architecture** (5-10 lines)
The major frameworks, libraries, and architectural patterns. Focus on what influences how tickets should be written — e.g. if it's a monolith vs microservices, that changes how feature tickets are scoped.

**UI/UX Conventions** (5-10 lines, if applicable)
Design language, component library, styling approach, naming conventions for CSS classes. The AI references these when writing frontend-related card descriptions.

**Terminology** (5-10 lines, if the project has domain-specific jargon)
A glossary of terms the AI should use correctly. E.g. "we say 'card' not 'ticket' in the UI, but the CLI uses ticket IDs like TK-42."

#### What NOT to include

- Local development setup (the remote AI never runs the project)
- How to run tests (irrelevant for ticket descriptions)
- File paths and directory structures (the AI can't navigate them)
- Detailed API endpoint documentation (too granular; use domain model instead)
- Git workflow or branching strategy
- CI/CD pipeline details
- Credentials, secrets, or environment variables

#### Writing style

- Be concrete. Say `pnpm` not "the package manager". Say `Nuxt 4` not "a Vue framework."
- Prefer compact lists and tables over prose paragraphs
- Include one real example where it clarifies (e.g. an example ticket ID format: `TK-42`)
- Write for an AI that is smart but has zero project context — state the obvious if it's load-bearing
- Don't explain *how* code works — explain *what things are* and *what rules govern them*

### Step 3: Review with the user

Present the draft to the user before uploading. Highlight:
- Any sections where you made assumptions (ask for confirmation)
- Sections you intentionally omitted and why
- Whether this is a fresh briefing or an update to an existing one

### Step 4: Upload via CLI

After the user approves:

```bash
completo briefing --file Completo-Briefing.md
```

This uploads the file as the project's agent briefing. Verify it worked:

```bash
completo briefing | head -5
```

### Step 5: Note in project documentation

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
2. Read `CLAUDE.md`/`AGENTS.md` for any recent changes
3. Check git log for significant recent changes: `git log --oneline -20`
4. Update only the sections that changed — don't rewrite the whole file
5. Upload via `completo briefing --file Completo-Briefing.md`

## Tips

- The briefing is markdown. Use headers, lists, and tables — the AI parses these well.
- You can upload multiple files: `completo briefing --file Completo-Briefing.md --file domain-glossary.md`
- View the current remote briefing anytime: `completo briefing`
- Clear the briefing: `completo briefing --clear`
- The briefing is per-project. If the CLI is configured with a `.completo` file, it uses that project automatically.
