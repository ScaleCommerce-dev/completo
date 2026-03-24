# Changelog

## v0.3.0

### App
- Display app version on profile page

### CLI
- Mask API token in `completo config` prompt

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
