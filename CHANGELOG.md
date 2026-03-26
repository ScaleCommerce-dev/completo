# Changelog

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
