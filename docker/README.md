# Docker

**This is the production image**, built in CI and released to GHCR. The local dev container is a separate, deliberately different setup — see `.zdev/Dockerfile` and the zdev section in `CLAUDE.md`.

Two-stage build: dependencies + Nuxt build in `node:24-alpine`, then only the compiled output copied to a clean `alpine:3.24` runtime image (just `nodejs` — no npm, no yarn, no corepack). Node 24 LTS and pnpm 11.17.0 throughout. SQLite database and file uploads persist in a `/data` volume.

The runtime base is bare alpine rather than `node:24-alpine` because it's ~109MB against ~229MB, and none of what that drops (npm, yarn, corepack, ~19MB of bundled node_modules) is used at runtime. Both ship Node 24.18.x with the same native ABI (`modules=137`), so the `better-sqlite3` binary compiled in stage 1 loads either way — that ABI match is the constraint to check before changing either base.

[zpinit](https://github.com/0ploy/zpinit) (pinned to `0.5.5`) runs as PID 1, replacing tini, `docker-entrypoint.sh` and supervisord. On every start it runs the scripts in `/etc/zpinit/entrypoint.d/` in order (mkdirs → migrate → init-admin → seed → cleanup), then supervises the services declared in `/etc/zpinit/services/`.

Because the Dockerfile sets no `CMD`, zpinit runs in **supervise mode** and stays resident as PID 1 for the container's lifetime. That means it reaps zombies continuously, restarts the Nuxt server with capped-exponential backoff (1s→30s) if it crashes, and answers `zpctl`. The config is validated at build time via `zpinit --check-config`, so a malformed service file fails the build rather than the deploy.

One consequence worth knowing: after 5 consecutive crashes zpinit marks the service FATAL and stops retrying, but the container still reports as running. Orchestrator restart policies won't see that — use `zpctl ready` as a healthcheck if you need the container to fail loudly.

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
docker exec <container> node scripts/user-create.ts you@example.com pass "You" admin
```

## CLI Scripts

Run scripts inside a container using the same `/data` volume:

```bash
# Seed demo data
docker run --rm -v completo-data:/data completo \
  node scripts/db-seed.ts

# Create a user
docker run --rm -v completo-data:/data completo \
  node scripts/user-create.ts user@example.com password123 "User Name"

# Run migrations only
docker run --rm -v completo-data:/data completo \
  node scripts/db-migrate.ts
```

Those invoke the `.ts` files directly. Node strips TypeScript natively (default since 22.18), so the image carries no tsx and needs no package manager — the dev container runs these exact same commands, which is why the two stay in sync.

Passing a command to `docker run` overrides the empty `CMD`, which switches zpinit to exec mode: it still runs the `entrypoint.d/` scripts first (so migrations apply), then runs your command once instead of supervising the server.

## Operating a running container

zpinit stays PID 1 in supervise mode, so the full `zpctl` surface works:

```bash
docker exec <container> zpctl status --verbose   # service state
docker exec <container> zpctl ready              # exit 0 iff app is up and ready
docker exec <container> zpctl restart app --wait # bounce the server in place
docker exec <container> zpctl tail -f app        # stream the service log
```

The supervised service is named `app` (from `services/10_app.toml`). Its readiness probe polls `http://127.0.0.1:$PORT/`; `on_timeout = "continue"` means a slow cold start won't abort boot, since `restart = "always"` already covers a server that genuinely dies.

## Data

Everything lives under `/data`:

- `sqlite.db` — SQLite database (+ WAL files)
- `uploads/` — file attachments

Back up the volume or bind-mount a host directory (`-v ./data:/data`) for persistence.
