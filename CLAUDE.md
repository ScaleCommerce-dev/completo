# Completo - All the Toppings. None of the Mess.

> **About this file:** CLAUDE.md is for agent guidance - architectural decisions, rules, conventions, and gotchas that can't be inferred from reading code. Don't bloat it with code-level details (file listings, prop docs, full API specs) that agents can discover by reading the source. Focus on the "why", not the "what".

Kanban board app. Nuxt 4 + Nuxt UI 4 + Tailwind 4 + Drizzle ORM + SQLite. Plus Jakarta Sans + JetBrains Mono. Lucide icons (`i-lucide-*`). pnpm.

```bash
pnpm install && npx drizzle-kit push && pnpm db:seed && pnpm dev  # http://localhost:3000
```

Demo: `demo@example.com` / `demo1234` | Admin: `admin@example.com` / `admin1234`

## Architecture

### The Core Model

**Statuses and cards belong to projects, not views.** Boards and lists are *views* — they don't own data. Cards have a `projectId` + `statusId`; boards see cards through `boardColumns` (junction table). Removing a column from a board just unlinks it — cards survive. Deleting a status cascades everywhere.

**Don't confuse the two kinds of "column":**

| Concept | What it is | DB table |
|---------|-----------|----------|
| **Board column** | How a status appears on a board (position) | `boardColumns` |
| **Field column** | Which card field shows in a list table | `listColumns` |

### Key Design Decisions

- **Done status & retention:** `doneStatusId` + `doneRetentionDays` on projects. Views **filter out** (not delete) old done cards. Card counts exclude done status. `null` retention = keep forever.
- **Primary keys:** UUIDs everywhere. **Exception:** cards use INTEGER AUTOINCREMENT (for `TK-42` style IDs). Always parse card IDs with `Number()`.
- **Positions:** Integer `position` field. New items = `max(existing) + 1` (not `.length`).
- **Password sentinels:** `'!oauth'` = OAuth-only user, `'!invited'` = admin-created pending setup. Both are unhashable.
- **Synthetic admin role:** API returns `role: 'admin'` for non-member admins viewing projects — don't display it as a real project role.

### Auth & Permissions

- `isAdmin=1` bypasses membership checks via synthetic `{ role: 'owner' }`. My Tasks is NOT admin-elevated.
- **404 not 403** for non-member access (don't leak resource existence).
- **IDOR prevention:** Every card/tag/board endpoint validates resources belong to the correct project.
- **No email in search results** — user search returns name only.
- Domain allowlist restricts self-registration only — invitations and admin-created users bypass it.
- Login requires verified email. `isEmailEnabled()` checks `SMTP_HOST`.

### Email Templates (Gotchas)

- Table-based layout only (no flexbox/grid)
- Solid hex colors only (no `rgba()` — breaks in 21% of clients)
- No `border-radius` on buttons (use VML `v:roundrect` for Outlook)

## Conventions

### Do

- **Fetch:** Pages use `useFetch()`, composables use `$fetch()`. Refresh after mutations.
- **Composables:** `useKanban()`/`useListView()` accept slug-or-ID + optional `{ projectSlug }` to prevent cross-project slug collisions. Both extend `useViewData()` which holds shared logic (CRUD, tags, members, permissions). Use `useMutation()` for try/catch/toast error handling in composables — don't hand-roll `try { ... } catch { toast.add(...) }`.
- **Shared types:** `app/types/card.ts` defines `BaseCard`, `CardWithStatus`, `Tag`, `Member`, `CardStatus`. Import from `~/types/card` — don't redeclare card interfaces.
- **Transactions:** `db.transaction()` for multi-step DB operations.
- **SSR:** `ssr: false` globally (SPA mode). vuedraggable via `defineAsyncComponent` + `<ClientOnly>`.
- **DB access:** `db` + `schema` auto-imported. `server/utils/` is auto-imported — don't use `~/server/utils/...` (Nuxt 4: `~` = `app/`).
- **Database schema:** `server/database/schema.ts` — all tables, columns, relations. Migrations in `server/database/migrations/`.
- **OpenAPI spec** (`server/assets/openapi.json`, served by `server/api/openapi.get.ts`) must stay in sync with endpoints. Only covers headless API usage — frontend-internal endpoints (slug/key validation, UI column config, notifications, OAuth redirects, registration flows) are intentionally omitted.
- **Server utils:** `enrichCardsWithMetadata()` and `fetchCardMetadata()` in `server/utils/card-metadata.ts` handle bulk tag + attachment count enrichment. Use these instead of inline tag/attachment queries in endpoints.
- **View components:** `ViewConfigModal` uses a `mode: 'board' | 'list'` prop — don't create separate config modals. `ViewHeader` is the shared header for board/list pages with a `#actions` slot for view-specific buttons.
- **Write tests** for new features. Run `pnpm test` and `pnpm lint` after changes.

### Don't

- **Don't use `theme()` in scoped CSS** — Tailwind v4 uses `var(--color-*)`.
- **Don't use CSS `ring-*` for tag pills** — they use `box-shadow` inset borders.
- **Don't use native `<input type="date">`** — use `UPopover` + `UCalendar` + `CalendarDate`.
- **Don't use `document.createElement('input')` for file pickers** — use a persistent hidden `<input>` ref.
- **Don't use `@keydown` on forms for Cmd+Enter** — portals break it. Use global `document` listener with `capture: true`.
- **Don't close the browser** during Playwright MCP sessions. Screenshots go in `.playwright/`, clean up after.
- **Don't add Co-Authored-By** lines to commits.

### Styling

- **Aesthetic:** "Trello meets Linear" — indigo-violet primary, zinc neutrals.
- **Priority icons:** `alert-circle`=urgent, `chevron-up`=high, `grip-horizontal`=medium, `chevron-down`=low. Colors: red/orange/indigo/slate. Helpers in `app/utils/constants.ts`.
- **Due date colors:** red=overdue, orange=due-soon (today/tomorrow), slate=future.
- **Ticket IDs:** `{projectKey}-{cardId}`, sits above card title (not in footer).
- **Destructive actions:** Wrapped in `<UTooltip>`. Views/projects use type-name-to-confirm; cards use simple confirm.
- **ESLint:** No comma dangles, 1tbs brace style.

## Testing

Two vitest projects: `unit` (fast) + `integration` (sequential, 30s timeout). Test DB on `:43210`.

**Gotchas:**
- `fetch(url('/path'))` for raw responses (ofetch throws on non-2xx)
- `randomKey()` in fixtures to avoid 409 conflicts
- `process.env.NODE_ENV` inlined at build — use custom env vars for runtime gating
- Kill stale test server: `lsof -ti:43210 | xargs kill -9`

## Environment & Commands

`NUXT_SESSION_PASSWORD` is the only required env var (min 32 chars). See `.env.example` for the rest. Key vars: `DATABASE_URL` (default `sqlite.db`), `AI_PROVIDER` (`anthropic`/`openai`/`openrouter`, empty=disabled), `SMTP_HOST` (empty=email disabled), `UPLOAD_DIR` (default `data/uploads`), `NUXT_OAUTH_*_CLIENT_ID/SECRET` (empty=provider disabled).

```bash
pnpm dev / build / test / lint / typecheck
pnpm db:migrate / db:seed / db:cleanup
pnpm user:create <email> <password> [name] [admin]
pnpm user:set-role <email> <admin|user>
pnpm user:verify-email <email>
npx drizzle-kit push          # Dev only — diffs schema against DB
npx drizzle-kit generate      # Generate migration SQL from schema changes
```

### Releasing

**Before tagging a release:** bump `version` in `package.json`, update `README.md` with any user-facing changes, and commit those changes.

**To release:** `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag push triggers two workflows:
- **CI** (`ci.yml`) — runs lint + tests against the tag.
- **Release** (`release.yml`) — builds multi-arch Docker image (`linux/amd64` + `linux/arm64`), pushes to GHCR (`ghcr.io/scalecommerce-dev/completo`), and creates a GitHub Release with auto-generated notes.

**To re-tag** (e.g. after a fix): delete the GitHub release (`gh release delete vX.Y.Z --yes`), delete remote + local tag (`git push origin --delete vX.Y.Z && git tag -d vX.Y.Z`), then re-tag and push.

### Schema Changes & Migrations

`drizzle-kit push` = dev (no migration files). `pnpm db:migrate` = production (applies SQL from `server/database/migrations/`).

**After every schema change:** edit `schema.ts` → `npx drizzle-kit generate` → commit the migration. If you skip generating, production deploys will fail.

**`scripts/package.json`** is a deploy manifest for CLI tools. When changing imports in scripts, update it to keep deps in sync.

## Documentation

- Nuxt: https://nuxt.com/llms.txt
- Nuxt UI: https://ui.nuxt.com/llms.txt
- Nuxt Auth Utils: https://raw.githubusercontent.com/atinux/nuxt-auth-utils/refs/heads/main/README.md
