# Docker

Two-stage build: dependencies + Nuxt build in `node:22-alpine`, then only the compiled output copied to a clean runtime image. SQLite database and file uploads persist in a `/data` volume.

On every container start the entrypoint runs migrations, seeds demo data (idempotent), and cleans up expired tokens before starting the server.

## Build

```bash
# Local (current platform only)
docker build -f docker/Dockerfile -t completo .

# Multi-arch (amd64 + arm64)
docker buildx build --platform linux/amd64,linux/arm64 -f docker/Dockerfile -t completo .
```

> Multi-arch requires a buildx builder with multi-platform support. Create one with:
> `docker buildx create --use --name multi-arch`

## Run

```bash
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=test-secret-min-32-chars-long-here \
  -v completo-data:/data \
  completo
```

Default credentials after first start: `demo@example.com` / `demo1234`, `admin@example.com` / `admin1234`.

## Environment Variables

Only `NUXT_SESSION_PASSWORD` is required. All others have sensible defaults.

| Variable | Default | Notes |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | — | **Required.** Min 32 chars. |
| `DATABASE_URL` | `/data/sqlite.db` | Path inside the container. |
| `UPLOAD_DIR` | `/data/uploads` | Path inside the container. |
| `PORT` | `3000` | |
| `SMTP_HOST` | — | Empty = email disabled. |
| `INIT_USER_EMAIL` | — | Auto-create this user on startup (skipped if already exists). |
| `INIT_USER_PASSWORD` | — | Required when `INIT_USER_EMAIL` is set. |
| `INIT_USER_NAME` | — | Optional display name. Defaults to local part of email. |
| `INIT_USER_ADMIN` | — | Set to `true` / `1` to make the user an admin. |

### Auto-create initial user

Set `INIT_USER_EMAIL` + `INIT_USER_PASSWORD` to provision a user on first start — useful for fresh deploys where you don't want to rely on the `admin@example.com` seed account. The check is idempotent: subsequent restarts skip creation if the user already exists.

```bash
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=test-secret-min-32-chars-long-here \
  -e INIT_USER_EMAIL=me@example.com \
  -e INIT_USER_PASSWORD=changeme1234 \
  -e INIT_USER_ADMIN=true \
  -v completo-data:/data \
  completo
```

## CLI Scripts

Run scripts inside a container using the same `/data` volume:

```bash
# Seed demo data
docker run --rm -v completo-data:/data completo \
  ./scripts/node_modules/.bin/tsx scripts/db-seed.ts

# Create a user
docker run --rm -v completo-data:/data completo \
  ./scripts/node_modules/.bin/tsx scripts/user-create.ts user@example.com password123 "User Name"

# Run migrations only
docker run --rm -v completo-data:/data completo \
  ./scripts/node_modules/.bin/tsx scripts/db-migrate.ts
```

## Data

Everything lives under `/data`:

- `sqlite.db` — SQLite database (+ WAL files)
- `uploads/` — file attachments

Back up the volume or bind-mount a host directory (`-v ./data:/data`) for persistence.
