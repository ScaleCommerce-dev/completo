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
