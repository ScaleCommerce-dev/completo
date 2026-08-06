# Completo - All the Toppings. None of the Mess.

> **About this file:** CLAUDE.md is for agent guidance - architectural decisions, rules, conventions, and gotchas that can't be inferred from reading code. Don't bloat it with code-level details (file listings, prop docs, full API specs) that agents can discover by reading the source. Focus on the "why", not the "what".

Kanban board app. Nuxt 4 + Nuxt UI 4 + Tailwind 4 + Drizzle ORM + SQLite. Plus Jakarta Sans + JetBrains Mono. Lucide icons (`i-lucide-*`). pnpm.

## ⚠️ Run everything in the zdev container

**This is a zdev-managed project. Every `pnpm`/`node`/`npx` command runs inside the container, never on the host.**

```bash
zdev start                    # boots the env: install → migrate → seed → dev server
zdev exec app <command>       # ← the way you run ANYTHING
```

```bash
zdev exec app pnpm test       # not: pnpm test
zdev exec app pnpm lint
zdev exec app pnpm typecheck
zdev exec app pnpm audit
zdev exec app pnpm install    # after changing package.json
```

Why it matters — these are not stylistic preferences:

- **`node_modules` is in `mutagen.ignore`.** The container has its own dependency tree; the host's is a *separate* copy. A host `pnpm install` does not change what the app runs, and host-only checks (audits, tests, dependency scans) inspect the wrong tree and report misleading results.
- **There is no `.env`.** Dev secrets come from a 1Password Environment injected at container creation, so host-side `pnpm dev` / `pnpm setup` start without `NUXT_SESSION_PASSWORD`, OAuth creds, or AI keys. See the 1Password notes under Local Dev Environment.
- **The database only exists in the container** (`/app/data/sqlite.db`, `data` named volume). Host `pnpm db:*` targets a database the app never reads.
- **Node/pnpm versions are pinned in the image** (Node 24, pnpm 11.17.0). The host may have anything.

**The only things that legitimately run on the host:** `zdev` itself, `git`, and the Go CLI in `cli/` (`go build` / `go test` — the dev image has no Go toolchain). If you genuinely need a host-side `pnpm` command, prefix it with `op run --env-file=...` to get the secrets, and know it operates on the host's separate `node_modules`.

Non-zdev installs (prod, CI) use `pnpm install && pnpm setup && pnpm dev` directly. `pnpm setup` chains migrate → init-admin → seed and reads `ADMIN_USER_EMAIL` / `ADMIN_USER_PASSWORD` (+ optional `ADMIN_USER_NAME`) to create the first admin; skip them and you get an empty install (no users, no demo project). Add an admin later with `pnpm user:create you@example.com password "You" admin`, then `pnpm db:seed` to populate.

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
- **Write tests** for new features. Run `zdev exec app pnpm test` and `zdev exec app pnpm lint` after changes.

### Don't

- **Don't use `theme()` in scoped CSS** — Tailwind v4 uses `var(--color-*)`.
- **Don't use CSS `ring-*` for tag pills** — they use `box-shadow` inset borders.
- **Don't use native `<input type="date">`** — use `UPopover` + `UCalendar` + `CalendarDate`.
- **Don't use `document.createElement('input')` for file pickers** — use a persistent hidden `<input>` ref.
- **Don't use `@keydown` on forms for Cmd+Enter** — portals break it. Use global `document` listener with `capture: true`.
- **Don't close the browser** during Playwright MCP sessions. Screenshots go in `.playwright/`, clean up after.
- **Don't add Co-Authored-By** lines to commits.
- **Don't commit code review files** (`CODE_REVIEW*.md`) — these are local-only artifacts, gitignored.

### Styling

- **Aesthetic:** "Trello meets Linear" — indigo-violet primary, zinc neutrals.
- **Priority icons:** `alert-circle`=urgent, `chevron-up`=high, `grip-horizontal`=medium, `chevron-down`=low. Colors: red/orange/indigo/slate. Helpers in `app/utils/constants.ts`.
- **Due date colors:** red=overdue, orange=due-soon (today/tomorrow), slate=future.
- **Ticket IDs:** `{projectKey}-{cardId}`, sits above card title (not in footer).
- **Destructive actions:** Wrapped in `<UTooltip>`. Views/projects use type-name-to-confirm; cards use simple confirm.
- **ESLint:** No comma dangles, 1tbs brace style.

## Testing

**When to run which tests:**
- **App changes** (anything under `app/`, `server/`, `shared/`): `zdev exec app pnpm test` — runs vitest unit + integration tests **in the container**.
- **CLI changes** (anything under `cli/`): `cd cli && go test ./...` — runs Go unit tests. This one runs **on the host**: the dev image has no Go toolchain.
- **Before releasing:** run both.

**App tests:** Two vitest projects: `unit` (fast) + `integration` (sequential, 30s timeout). Test DB on `:43210`. Tests use their own throwaway `test.db` inside the container, so they never touch the dev database.

**CLI tests:** Go unit tests covering semver comparison, env file parsing, config precedence, and output formatting. No HTTP integration tests — the CLI is a thin API client; the API is tested by the vitest integration suite.

**Gotchas:**
- `fetch(url('/path'))` for raw responses (ofetch throws on non-2xx)
- `randomKey()` in fixtures to avoid 409 conflicts
- `process.env.NODE_ENV` inlined at build — use custom env vars for runtime gating
- Kill stale test server: `zdev exec app sh -c 'fuser -k 43210/tcp'` (in-container port; a host `lsof -ti:43210` won't see it)

## Environment & Commands

`NUXT_SESSION_PASSWORD` is the only required env var (min 32 chars). See `env.sample` for the rest. Key vars: `DATABASE_URL` (default `sqlite.db`), `AI_PROVIDER` (`anthropic`/`openai`/`openrouter`, empty=disabled), `SMTP_HOST` (empty=email disabled), `UPLOAD_DIR` (default `data/uploads`), `NUXT_OAUTH_*_CLIENT_ID/SECRET` (empty=provider disabled).

In dev these run **in the container** — prefix each with `zdev exec app` (several have a shorter `zdev` alias, see Local Dev Environment). The bare forms below are what prod/CI run.

```bash
zdev exec app pnpm build / test / lint / typecheck    # `pnpm dev` is already supervised by zpinit
zdev exec app pnpm db:migrate / db:init-admin / db:seed / db:cleanup   # or: zdev migrate | seed | cleanup
zdev exec app pnpm user:create <email> <password> [name] [admin]
zdev exec app pnpm user:set-role <email> <admin|user>
zdev exec app pnpm user:verify-email <email>
zdev migrate generate                                # drizzle-kit generate — then COMMIT the .sql + meta/
zdev exec app pnpm setup                             # migrate + init-admin + seed (non-zdev bootstrap only)
```

### Local Dev Environment (zdev)

`.zdev/` defines the containerized dev env (was `.scdev/`). `zdev start` serves the app at `https://completo.0ploy.dev`.

**Two Docker setups, deliberately different — don't unify them:**

| | `docker/Dockerfile` (prod) | `.zdev/Dockerfile` (dev) |
|---|---|---|
| Purpose | Released image, built in CI | Local dev container |
| Runtime base | `alpine:3.24` + `apk add nodejs` (~109MB) | `node:24-alpine` (~229MB) |
| zpinit mode | 3 — supervise (`node .output/…`) | 3 — supervise (`pnpm dev`) |
| Admin user | From `ADMIN_USER_*` env vars | Hardcoded dev credentials |

Prod optimizes for size and drops npm/corepack it never uses; dev needs corepack (pnpm) and `python3/g++/make` (better-sqlite3 has no musl prebuild). Node 24 LTS + pnpm 11.17.0 in both — bump `packageManager` in `package.json` and both Dockerfiles together.

**Scripts run as `node scripts/foo.ts` — no tsx, no package manager.** Node strips TypeScript natively (default since 22.18; `process.features.typescript === 'strip'`), so the same command works in dev, in prod, and on the host. This is deliberate: the prod runtime image has neither npm nor pnpm, so anything invoking a package manager could not be shared between the two. Two constraints follow:
- `engines.node >= 22.18` in `package.json`. Type stripping is erasable-syntax-only, so **no `enum`, `namespace`, parameter properties, or decorators in `scripts/*.ts`**, and relative imports would need explicit `.ts` extensions (currently there are none).
- `scripts/package.json` still vendors `better-sqlite3`/`dotenv`/`drizzle-orm` into `scripts/node_modules` for the prod image (installed with npm — it has its own `package-lock.json`). It no longer carries `tsx`.

`node:sqlite` would let us drop `better-sqlite3` (and with it the native toolchain and the builder↔runtime ABI constraint), but `drizzle-orm/node-sqlite` only exists in drizzle-orm v1 beta. Revisit when v1 is stable.

```bash
zdev start / stop / restart / logs -f app
zdev update              # apply config.yaml changes (restart alone does NOT)
zdev exec app pnpm test  # run any command in the container
zdev info                # shows the dev logins
zdev mail                # Mailpit — catches all outgoing mail
zdev migrate             # apply migrations; also: generate | push | seed | cleanup
```

- **Dev logins are seeded on every boot** and printed by `zdev info`: `admin@completo.local / admin1234` (admin) and `demo@completo.local / demo1234`. Defined once in `.zdev/config.yaml` `variables:` and referenced from both `environment:` and `info:`. Dev-only — prod still provisions from `ADMIN_USER_*`.
- **Boot order** is `.zdev/zpinit/entrypoint.d/`: `10-install` (waits for the `/.zdev-sync-ready` marker, then `pnpm install`) → `20-migrate` → `30-seed`, then zpinit supervises `pnpm dev` from `.zdev/zpinit/services/10_app.toml`.
- **The dev container is built not to die.** zpinit stays PID 1 (supervise mode) and `entrypoint_on_failure = "continue"`, so a crashed dev server *or* a failed `pnpm install` leaves a live container with the error in `zdev logs` — always something to `zdev exec app sh` into. After 5 consecutive crashes the service goes FATAL and zpinit stops retrying, still holding the container open. Drive it with `zdev exec app zpctl status` / `zpctl restart app` / `zpctl tail -f app`.
- **`.zdev/config.yaml` must not set `command:`** — zdev turns that into the container CMD, which flips zpinit out of supervise mode into exec mode.
- **Editing `entrypoint.d/` needs a rebuild.** `.zdev` is excluded from the file sync, so `/etc/zpinit` is the image's copy. `zdev update` rebuilds on *Dockerfile content* changes only — touch `.zdev/Dockerfile` after editing an entrypoint script.
- **The container's DB is `/app/data/sqlite.db` in the `data` named volume, and it is the only dev database.** It's out of the file sync deliberately (SQLite WAL over Mutagen risks corruption), and no host-side `sqlite.db` shadows it — `*.db*` is in `mutagen.ignore` so a stray one can't sync in and look authoritative.

  Dev data is **disposable by design**: `zdev down -v -f` destroys the volume and the next `zdev start` rebuilds it from migrations + seed, back to the demo board and the two fixed logins. Nothing else holds a copy, so that command means what it says. Tests are unaffected (they use their own throwaway `test.db`).

  Historical trap, in case old notes say otherwise: before `DATABASE_URL` was set here, the app fell back to the relative default `'sqlite.db'`, which resolved against `/app` — the bind-mounted project dir — so the container silently shared the *host's* DB. That's why a container could appear to "lose" data when the setting was introduced.
- Boot applies committed migrations (`node scripts/db-migrate.ts`). For a schema change: `zdev migrate generate`, commit it, restart. There is no `zdev migrate push` — see Schema Changes & Migrations for why.
- **`.zdev/commands/migrate.just` → `zdev migrate`** is only an alias for those same `node scripts/*.ts` commands, so dev and prod stay verifiably identical. Adding a `.just` file there adds a `zdev <name>` subcommand.
- **Email is wired to the shared Mailpit** (`SMTP_HOST: mail`). Because `isEmailEnabled()` keys off `SMTP_HOST`, logins require a verified email — the seeded users are auto-verified; check other mail via `zdev mail`.
- **There is no `.env` file.** Dev secrets (`NUXT_SESSION_PASSWORD`, the OAuth client IDs/secrets, AI keys) live in a 1Password Environment, attached via `op-env: ${op-env}` on the app service. The Environment **ID** in `.zdev/config.yaml` is not secret and commits safely; values are fetched by the `op` CLI only when a container is created. Needs the beta CLI (`brew install 1password-cli@beta`) with the desktop-app integration enabled.
  - After rotating or adding variables in 1Password: **`zdev update --refresh-secrets`**. Plain `zdev restart`/`zdev update` will *not* pick them up — the env is baked into the container at creation. The refresh compares a `zdev.secrets-hash` label and only recreates services whose injected set actually changed, so it's cheap to run habitually.
  - Non-secret, dev-specific values (`SMTP_HOST: mail`, `APP_URL`, `DATABASE_URL`, the dev logins) stay as explicit `environment:` entries — those always win over injected variables, which is what keeps prod-shaped values in 1Password from leaking into dev.
  - Host-side `pnpm dev` / `pnpm setup` no longer get these vars automatically. Prefix with `op run --env-file=...` or export them manually if you need to run outside the container.
- Per-developer overrides go in `.zdev/local/config.yaml` (gitignored, deep-merged). Don't put secrets in `.zdev/config.yaml` — use the 1Password Environment.
- `zdev restart` does not pick up `config.yaml` edits — use `zdev update`. Source changes are live via the file sync.

### Changelog

`CHANGELOG.md` uses `## vX.Y.Z` sections (latest on top) with `### App` and `### CLI` subsections. When making changes, add entries under `## Unreleased` at the top. If no `## Unreleased` section exists, create one. Use concise, user-facing language (not commit messages). At release time, rename `## Unreleased` to `## vX.Y.Z` with the date and add a fresh `## Unreleased` section.

### Releasing

**Before tagging a release:** bump `version` in `package.json`, rename `## Unreleased` to `## vX.Y.Z` in `CHANGELOG.md`, update `README.md` with any user-facing changes, and commit those changes.

**To release:** `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag push triggers two workflows:
- **CI** (`ci.yml`) — runs lint + tests against the tag.
- **Release** (`release.yml`) — builds multi-arch Docker image, cross-compiles Go CLI binaries (5 targets), pushes Docker to GHCR (`ghcr.io/scalecommerce-dev/completo`), and creates a GitHub Release with changelog notes and CLI binaries attached.

**To re-tag** (e.g. after a fix): delete the GitHub release (`gh release delete vX.Y.Z --yes`), delete remote + local tag (`git push origin --delete vX.Y.Z && git tag -d vX.Y.Z`), then re-tag and push.

### CLI (`cli/`)

Go CLI for interacting with Completo from the terminal or AI agents. Uses Cobra. Config: `~/.completo/.env` (credentials) + `.completo` (project-scoped). Build: `cd cli && go build -o completo .`

**Local dev override:** Create a `.completo.local` file (gitignored) alongside `.completo` to point the CLI at the local dev server instead of production. Config precedence: `~/.completo/.env` → `.completo` → `.completo.local` → `--env-file` → env vars.

```env
# .completo.local
COMPLETO_URL=http://localhost:3000
COMPLETO_TOKEN=<dev-api-token>
```

Alternatively, use `--env-file path/to/env` for one-off overrides (e.g. CI, testing a built binary from a different directory).

### Agent Skill (`skills/completo/SKILL.md`)

The Completo agent skill lives in-repo at `skills/completo/SKILL.md` — this is the local development copy, not the installed one. When CLI commands change, update this file to keep the skill in sync. Use the `/skill-creator` skill to help with updates.

### Completo Briefing

`Completo-Briefing.md` provides project context to Completo's AI features (card description generation). Update it when the domain model, architecture, or conventions change significantly. Use the `/completo-briefing` skill to regenerate it, then upload via `completo briefing --file Completo-Briefing.md`.

### Schema Changes & Migrations

**Every schema change requires a committed migration. No exceptions.**

1. Edit `server/database/schema.ts`
2. `zdev migrate generate` (drizzle-kit runs in the container — a host `npx drizzle-kit` would read the host's separate deps and no dev database)
3. **Commit both** the new `server/database/migrations/*.sql` *and* the `meta/` changes — `meta/_journal.json` is what the migrator reads; a `.sql` file without its journal entry is invisible and silently never runs
4. Apply with `zdev migrate` (or just restart the dev container — it migrates on every boot)

`pnpm db:migrate` is the only thing that touches a real database: dev container boot, the prod entrypoint, and deploys all run it. Skip steps 2–3 and the change exists only on your machine — CI, the prod image, and every teammate diverge, and the deploy fails on the first query against the missing column.

**Never run `drizzle-kit push` against a database you keep.** It applies the schema without recording a migration, which permanently poisons that DB: `db:migrate` afterwards either restarts at `0000` and dies on `table already exists`, or — if you later generate the matching migration — dies on `duplicate column name`. Both are verified. `pnpm setup` breaks too, since it chains migrate first. The only fix is to discard the database (`zdev down -v -f && zdev start` for the dev container; its SQLite is a named volume and boot re-migrates and re-seeds). If it holds data worth saving, the `__drizzle_migrations` journal can be backfilled by hand — ask before attempting it.

**`scripts/package.json`** is a deploy manifest for CLI tools. When changing imports in scripts, update it to keep deps in sync.

## Documentation

- Nuxt: https://nuxt.com/llms.txt
- Nuxt UI: https://ui.nuxt.com/llms.txt
- Nuxt Auth Utils: https://raw.githubusercontent.com/atinux/nuxt-auth-utils/refs/heads/main/README.md
