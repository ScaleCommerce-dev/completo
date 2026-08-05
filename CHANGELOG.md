# Changelog

## Unreleased

### App
- **Security: `env.sample` no longer ships a working `NUXT_SESSION_PASSWORD`.** It contained a real 44-character key, so any install that copied the file verbatim ran on a cookie-signing key published in the repo. It is now a deliberately too-short placeholder (`replace-me`), which fails fast with "Password string too short (min 32 characters required)" instead of silently working. Existing installs that copied that value should rotate it (`openssl rand -base64 32`); doing so invalidates current sessions.

### Dev
- **The dev environment no longer uses a `.env` file.** Dev secrets (`NUXT_SESSION_PASSWORD`, the GitHub/Google/Microsoft OAuth client IDs and secrets, AI keys) now come from a 1Password Environment, attached to the app service with `op-env:` in `.zdev/config.yaml`. Only the Environment ID is committed — it isn't secret, and values are fetched by the `op` CLI when a container is created. Requires the beta 1Password CLI (`brew install 1password-cli@beta`) with the desktop-app integration enabled.
  - After rotating or adding variables in 1Password, run `zdev update --refresh-secrets`. A plain `zdev restart` or `zdev update` will not pick them up, since the env is baked in at container creation.
  - Non-secret dev values (`SMTP_HOST`, `APP_URL`, `DATABASE_URL`, the seeded dev logins) stay as explicit `environment:` entries, which always win over injected variables.
  - Host-side `pnpm dev` / `pnpm setup` no longer receive these vars automatically — use `op run` or export them.
- `env.sample` still applies to Docker and manual installs — only the zdev container stopped using a `.env` file.

## v0.6.7 (2026-08-05)

### App
- **Docker: zpinit now supervises the server instead of exec'ing it.** The image sets no `CMD`, which puts [zpinit](https://github.com/0ploy/zpinit) in supervise mode — it stays PID 1, so it reaps zombies for the container's whole lifetime and restarts the Nuxt server with capped-exponential backoff (1s→30s) if it crashes. Previously zpinit exec'd the server and exited, leaving no reaper and no in-container restarts. A readiness probe backs `zpctl ready`, and `zpctl status/restart/tail` now work (they were inert before).
  - Note: after 5 consecutive crashes the service is marked FATAL while the container still reports running. Use `zpctl ready` as a healthcheck if you need the container to fail loudly.
  - Passing a command to `docker run` still overrides this and runs that command once, so the ad-hoc CLI script invocations are unchanged.
- Docker: zpinit is pinned to `0.5.5` instead of `latest` for reproducible builds, and its config is validated at build time (`zpinit --check-config`) so a malformed service file fails the build rather than the deploy.
- **Fix: `pnpm setup` failed on a fresh clone.** `scripts/init-admin.sh` hardcoded `scripts/node_modules/.bin/tsx`, which only exists in the Docker image (`cd scripts && npm install`) and is gitignored otherwise — so the documented first-time bootstrap died at `db:init-admin` with `MODULE_NOT_FOUND`. It now runs `node scripts/user-create.ts` directly, like every other `db:*` / `user:*` script.
- Node 24 LTS and pnpm 11.17.0 are now pinned consistently across `package.json`, the prod image and the dev image. The prod runtime base moves from `alpine:3.23` to `alpine:3.24` (same Node 24.18.x, same native ABI).
- **`tsx` is gone — scripts run as `node scripts/foo.ts`.** Node strips TypeScript natively (default since 22.18), so the same command now works in dev, in prod, and on the host. Previously the prod entrypoint used a vendored tsx binary while dev used `pnpm db:*`, so the two paths differed for no good reason. `tsx` is dropped from `scripts/package.json`, shrinking the prod image by ~16MB (188MB → 172MB), and the runtime image now contains no package manager and no TS loader at all.
  - New `engines.node >= 22.18` in `package.json`. `scripts/*.ts` must stay within erasable syntax (no `enum`, `namespace`, parameter properties or decorators) and use no extension-less relative imports.
  - Ad-hoc invocations change accordingly: `docker exec <container> node scripts/user-create.ts …` (was `node ./scripts/node_modules/.bin/tsx scripts/user-create.ts …`).
- **README corrections.** The documented `SMTP_PORT` default was wrong (`587` — the code falls back to `1025`). The quickstart claimed Node alone was enough, but a fresh Node has no `pnpm` on PATH, so `corepack enable` is now an explicit step alongside the Node 22.18 floor. "All commands work with both `npm run` and `pnpm`" was true of the individual scripts but not `setup`, which chains via pnpm. `db:cleanup` was described as removing "expired sessions and soft-deleted data" — it touches neither; it drops orphaned rows and expired invites/tokens, prunes unused uploads, and VACUUMs.
- **README: new "Development environment (zdev)" section** documenting the containerised dev setup and its seeded logins.

### Dev
- Local dev environment migrated from `.scdev/` to `.zdev/` (the tool's current name and config format). Use `zdev start`; run `zdev update` — not `zdev restart` — after editing `.zdev/config.yaml`.
- **The dev container now boots via zpinit too**, from its own `.zdev/Dockerfile`. On every start it runs install → migrate → seed, then supervises the Nuxt dev server.
- **The dev container is built not to die**, so there's always something to debug. zpinit runs in supervise mode (stays PID 1, restarts the dev server with 1s→30s backoff) and `entrypoint_on_failure = "continue"`, so neither a crashed dev server nor a failed `pnpm install` takes the container down — the error stays in `zdev logs` and `zdev exec app sh` keeps working. `zpctl` is available inside the container (`zpctl status`, `zpctl restart app`, `zpctl tail -f app`).
- **Two fixed dev logins are seeded on every boot** and shown by `zdev info`: `admin@completo.local / admin1234` (admin) and `demo@completo.local / demo1234`. Both are created auto-verified. Dev-only — production still provisions from `ADMIN_USER_*`.
- Dev env wires the shared Mailpit (`SMTP_HOST: mail`), so invitation and verification mails are catchable via `zdev mail`. Because `isEmailEnabled()` keys off `SMTP_HOST`, dev logins require a verified email. `APP_URL` points at the routed HTTPS domain so links in those mails resolve.
- **The dev SQLite DB moved to `/app/data/sqlite.db` in a named volume**, out of the file sync (WAL files over Mutagen risk corruption). It is now the *only* dev database — previously, with no `DATABASE_URL` set, the container fell back to the relative `'sqlite.db'` default and silently shared the host's file. `*.db*` is also in `mutagen.ignore` so a host-side DB can't sync in and shadow it. Dev data is disposable by design: `zdev down -v -f` destroys the volume and the next `zdev start` reseeds from scratch.
- **Docs: `drizzle-kit push` is now documented as prohibited, not a dev shortcut.** Every schema change needs a committed migration. Two verified failure modes are recorded in `CLAUDE.md`: a `push`-built DB can never be migrated (`db:migrate` restarts at `0000` and dies on `table already exists`, which also breaks `pnpm setup`), and pushing then generating the matching migration still breaks the *next* migrate with `duplicate column name`.
- Boot applies committed migrations (`node scripts/db-migrate.ts`) rather than `drizzle-kit push`, which can prompt on destructive changes and would hang in the TTY-less boot.
- **New `zdev migrate` command** (`.zdev/commands/migrate.just`): `zdev migrate` applies pending migrations, plus `generate` (new SQL from schema changes), `seed` and `cleanup`. Each is a thin alias for the same command the container runs at boot. There is deliberately no `push` alias — see below.
- The dev image no longer installs anything with npm (the global `tsx` install is gone) — pnpm is the only package manager in it.
- `.zdev/local/` is gitignored for per-developer overrides (deep-merged onto the committed config).

## v0.6.6 (2026-05-27)

### App
- **BREAKING (security)**: No more default credentials. `pnpm db:seed` no longer creates `admin@example.com / admin1234` or `demo@example.com / demo1234` — production installs no longer ship with well-known accounts. Provision your admin via env vars (Docker) or `pnpm user:create` (dev); the demo project is then created and attributed to that admin. Skipping admin provisioning leaves an empty user table (only AI skills are seeded).
- **BREAKING (Docker)**: when `ADMIN_USER_EMAIL` / `ADMIN_USER_PASSWORD` are unset, no admin is provisioned. Production deploys must set these env vars or provision out-of-band via `docker exec <container> node ./scripts/node_modules/.bin/tsx scripts/user-create.ts <email> <password> "Name" admin`.
- Admin user creation has a **single source of truth**: `scripts/user-create.ts`. The new `scripts/init-admin.sh` is a thin wrapper that calls `user-create.ts --from-env --skip-existing`; dotenv (inside the tsx script) loads `.env` as data, so values are never shell-evaluated. Both the Docker entrypoint and `pnpm db:init-admin` delegate to it.
- New `--from-env` mode on `scripts/user-create.ts` reads `ADMIN_USER_EMAIL` / `ADMIN_USER_PASSWORD` / `ADMIN_USER_NAME` from the environment, implies `admin`, and exits 0 with a `[skipping]` log when the env vars are absent.
- **Security fix**: `scripts/user-create.ts` argument parsing tightened. The `admin` role marker is now only honored as the trailing positional (when there are ≥3 positionals). The previous `args.includes('admin')` check silently elevated any user whose password was literally `"admin"`.
- New `pnpm setup` command chains `db:migrate → db:init-admin → db:seed` so first-time bootstrap is one command in dev.
- The Nitro `init-admin` plugin is removed — no more boot-time DB writes from the server process.
- Demo project + 4 sample cards are attributed to whichever admin exists when the seed runs. If no admin exists yet, the demo project is skipped (the seed logs a hint to run `pnpm user:create ... admin` first, then re-run seed).

## v0.6.5 (2026-05-27)

### App
- Fix: `ADMIN_USER_EMAIL=admin@example.com` (or any other collision with the seed admin) was silently ignored. The seed now creates the admin **from env vars** when `ADMIN_USER_*` is set (falling back to the demo `admin@example.com / admin1234` only when unset), so the env-provided credentials are the working login on first boot.
- Demo project ownership now goes to the admin (env-provided or default). The demo user (`demo@example.com / demo1234`) is added as a regular member instead of the owner. This keeps the env admin in charge of their own deployment and avoids leaving the well-known `admin@example.com / admin1234` credentials in production databases.

## v0.6.4 (2026-05-27)

### App
- **BREAKING**: Renamed `INIT_USER_*` env vars to `ADMIN_USER_*` and dropped the `INIT_USER_ADMIN` flag — the auto-created user is always an admin. Use `ADMIN_USER_EMAIL`, `ADMIN_USER_PASSWORD`, and the optional `ADMIN_USER_NAME`. (Matches the [Plausible](https://plausible.io) naming convention.)
- Bump dependencies to current versions, including `@nuxt/ui` 4.7. Dropdown menu item types now use the stricter `DropdownMenuItem` from `@nuxt/ui` directly.

### Docker
- Replace `entrypoint.sh` with [zpinit](https://github.com/0ploy/zpinit) as PID 1. zpinit runs the scripts in `/etc/zpinit/entrypoint.d/` (migrate → seed → cleanup) and then exec's the Nuxt server.
- Slim the runtime image from 334 MB → 185 MB (-44%): bare `alpine:3.23` + `apk add nodejs` instead of `node:22-alpine` (no npm, no yarn, no corepack).
- Bump base to Node 24 LTS.

### Tooling
- Upgrade pnpm to 11.4.0 (set via `packageManager` field in `package.json` so corepack auto-activates it).
- Add `minimumReleaseAge: 10080` (7-day soak window) in `pnpm-workspace.yaml` — supply-chain defense against freshly-published malicious packages. The Docker build overrides this to 0 since the committed lockfile is already the trust boundary there.
- Migrate `onlyBuiltDependencies` / `ignoredBuiltDependencies` to pnpm 11's `allowBuilds` map.
- Bump CI/release workflows to Node 24 (pnpm version picked up from `packageManager`).

## v0.6.3 (2026-05-06)

### App
- Auto-create initial user on every server startup (dev and production), not just Docker, when `INIT_USER_EMAIL` and `INIT_USER_PASSWORD` are set

## v0.6.2 (2026-05-06)

### App
- Docker: auto-create an initial user on container start when `INIT_USER_EMAIL` and `INIT_USER_PASSWORD` are set (idempotent; supports optional `INIT_USER_NAME` and `INIT_USER_ADMIN`)
- Fix board drag-and-drop so cards no longer briefly reappear in the source column before settling in the target

## v0.6.1 (2026-03-28)

### CLI
- Add `project-create` command to create new projects from the CLI

## v0.6.0 (2026-03-28)

### App
- Add copy-link and copy-ticket-ID hover actions to ticket IDs in board, list, modal, and detail views
- Extract `TicketIdCopy` component and `useCopyTicketId` composable (deduplication)
- Centralize card type definitions using shared types from `~/types/card`
- Switch local dev environment to scdev

### CLI
- Add `briefing` command to view, upload, or clear the project's agent briefing
- Add `list` command with `--status`, `--priority`, `--assignee`, and `--limit` filters
- Add `--all` flag to `next` command to list all cards in a status
- Add `.completo.local` support for local dev credential overrides
- Add `--env-file` global flag to override config from any env file
- Fix project resolution to match by name in addition to slug and ID

## v0.5.1

### App
- Collapsible sidebar with divider-edge chevron toggle and cookie-persisted state
- View header card count now reflects active filters
- Fix typecheck: make useViewPage generic to preserve card subtypes

### CLI
- Improve completo agent skill: add explicit commit step before moving to Done

## v0.5.0

### App
- Add attachment upload to create card form with auto-save on first file upload
- Image picker in description editor works with draft cards during creation
- Discard confirmation when closing create card form with unsaved changes
- Race condition protection for concurrent draft card creation

## v0.4.0

### App
- Add view filters for status, priority, assignee, and tags on both boards and lists
- Filter state persisted per view via settings modal with pill toggles and multi-select
- Compact filter badge in header with tooltip summary replaces priority buttons and tag pills
- Redesigned View Settings modal: Name, Columns, and Filters sections
- Fix pre-existing ESLint v-html warning in ProseDescription component

## v0.3.0

### App
- Display app version on profile page

### CLI
- Mask API token in `completo config` prompt

### Infra
- Gate release builds (Docker, CLI binaries) behind CI checks

## v0.2.0

### App
- Add `GET /api/projects/{id}/cards` endpoint with filtering (status, assignee, priority, tags, due date), sorting, and pagination
- Fix OpenAPI spec: members endpoint response shape, missing fields on Card/Status/List schemas

### CLI
- Initial release: fetch, move, assign, update, search cards
- Project-local `.completo` config file support
- Self-update command
- Key-value output format (token-efficient for AI agents)
- `--json` flag for programmatic use

## v0.1.0

- Initial release
