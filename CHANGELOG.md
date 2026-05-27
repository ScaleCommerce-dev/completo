# Changelog

## Unreleased

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
