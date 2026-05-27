# Docker

Two-stage build: dependencies + Nuxt build in `node:22-alpine`, then only the compiled output copied to a clean runtime image. SQLite database and file uploads persist in a `/data` volume.

[zpinit](https://github.com/0ploy/zpinit) runs as PID 1. On every start it runs the scripts in `/etc/zpinit/entrypoint.d/` in order (mkdirs → migrate → seed → cleanup), then exec's the Nuxt server. zpinit also reaps zombies so the container stays clean.

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

No default accounts are created. Set `ADMIN_USER_EMAIL` + `ADMIN_USER_PASSWORD` (see below) to provision your admin on first boot. The demo project + sample cards are then created and attributed to that admin.

### Passing many env vars

Use `--env-file` to load a file. Nuxt's production server does **not** read `.env` itself, so file-based config must be passed through Docker:

```bash
docker run -p 3000:3000 --env-file .env -v completo-data:/data completo
```

## Environment Variables

Only `NUXT_SESSION_PASSWORD` is required. All others have sensible defaults.

| Variable | Default | Notes |
|---|---|---|
| `NUXT_SESSION_PASSWORD` | — | **Required.** Min 32 chars. |
| `DATABASE_URL` | `/data/sqlite.db` | Path inside the container. |
| `UPLOAD_DIR` | `/data/uploads` | Path inside the container. |
| `PORT` | `3000` | |
| `SMTP_HOST` | — | Empty = email disabled. |
| `ADMIN_USER_EMAIL` | — | Provision this admin on startup. Skipped if absent — no fallback default admin. |
| `ADMIN_USER_PASSWORD` | — | Required when `ADMIN_USER_EMAIL` is set. |
| `ADMIN_USER_NAME` | — | Optional display name. Defaults to local part of email. |

### Provision an admin user

Set `ADMIN_USER_EMAIL` + `ADMIN_USER_PASSWORD` on first boot. The entrypoint runs `scripts/user-create.ts` under the hood with `--skip-existing`, so subsequent restarts are no-ops if the user is already there. The created user is always an admin and owns the seeded demo project.

```bash
docker run -p 3000:3000 \
  -e NUXT_SESSION_PASSWORD=test-secret-min-32-chars-long-here \
  -e ADMIN_USER_EMAIL=me@example.com \
  -e ADMIN_USER_PASSWORD=changeme1234 \
  -v completo-data:/data \
  completo
```

If you skip these env vars, no admin is created. You can still provision one ad-hoc against a running container:

```bash
docker exec <container> node ./scripts/node_modules/.bin/tsx scripts/user-create.ts you@example.com pass "You" admin
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

Inside a running container, use `zpctl status` and `zpctl pid` to inspect zpinit. The supervisor mode features (start/stop/restart) only apply when zpinit manages services — in our setup it runs the entrypoint scripts and then exec's into the Nuxt server, so the server takes over as PID 1 and zpinit exits.

## Data

Everything lives under `/data`:

- `sqlite.db` — SQLite database (+ WAL files)
- `uploads/` — file attachments

Back up the volume or bind-mount a host directory (`-v ./data:/data`) for persistence.
