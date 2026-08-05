# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
RUN apk add --no-cache python3 g++ make

WORKDIR /app

# Install dependencies first (layer caching).
# Strip the workspace's minimumReleaseAge for this build stage: locally
# we keep a 7d soak window to guard against fresh malicious publishes,
# but in Docker the committed lockfile is the authoritative trust
# boundary, so the registry-time recheck just blocks legitimate builds
# for a week after every dependency update.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN sed -i 's/^minimumReleaseAge:.*/minimumReleaseAge: 0/' pnpm-workspace.yaml \
 && pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Install scripts/ runtime dependencies (better-sqlite3, dotenv, drizzle-orm)
# into scripts/node_modules, where Node resolves them from scripts/*.ts.
# scripts/ has its own npm package-lock.json, so it's installed with npm here.
#
# No tsx: Node strips TypeScript natively (default since 22.18), so the
# entrypoint runs `node scripts/db-migrate.ts` directly. That's the identical
# command the dev container uses, and it needs no package manager at
# runtime — which matters because the runtime stage below has neither npm
# nor pnpm.
RUN cd scripts && npm install --omit=dev

# ── Stage 2: Runtime ───────────────────────────────────────────────
# Bare alpine + just `nodejs` (no npm, no yarn, no corepack): ~109MB
# versus ~229MB for node:24-alpine, and none of the dropped tooling is
# used at runtime. Alpine 3.24 ships node 24.18.x — same major (and same
# ABI, modules=137) as the node:24-alpine builder, so the better-sqlite3
# .node binary compiled in stage 1 loads cleanly.
#
# Pinned to a minor: alpine holds one node major per release branch, so
# 3.24 stays on node 24. Bumping this line to a branch that ships a
# different node major would break the stage-1 native binary — verify
# `node -p process.versions.modules` matches the builder before moving it.
FROM alpine:3.24 AS runtime

RUN apk add --no-cache nodejs

# zpinit + zpctl as PID 1 (replaces tini + entrypoint.sh + supervisord).
# Pinned rather than :latest so image builds stay reproducible.
# See https://github.com/0ploy/zpinit
COPY --from=ghcr.io/0ploy/zpinit:0.5.5 /usr/local/bin/zpinit /usr/local/bin/zpinit
COPY --from=ghcr.io/0ploy/zpinit:0.5.5 /usr/local/bin/zpctl  /usr/local/bin/zpctl

WORKDIR /app

# Copy built Nuxt output (includes server + node_modules for native deps)
COPY --from=builder /app/.output .output/

# Copy scripts with node_modules (tsx + better-sqlite3 for CLI tools)
COPY --from=builder /app/scripts scripts/

# Copy migrations (db-migrate.ts resolves server/database/migrations relative to CWD)
COPY --from=builder /app/server/database/migrations server/database/migrations/

# Copy zpinit config: globals + entrypoint.d scripts + supervised services
COPY docker/zpinit/ /etc/zpinit/
RUN chmod +x /etc/zpinit/entrypoint.d/*.sh \
 && zpinit --check-config /etc/zpinit/

# Create data directory for SQLite + uploads
RUN mkdir -p /data

# Environment defaults
ENV DATABASE_URL=/data/sqlite.db
ENV UPLOAD_DIR=/data/uploads
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
VOLUME /data

# zpinit runs entrypoint.d/*.sh in order (mkdirs → migrate → init-admin →
# seed → cleanup), then supervises services/*.toml.
#
# Deliberately NO CMD: an empty CMD selects zpinit's supervise mode, so it
# stays PID 1 (reaping zombies, restarting the server on crash, serving
# zpctl) instead of exec'ing away. Passing a command to `docker run` still
# overrides this and runs that command once — see docker/README.md for the
# ad-hoc CLI script invocations that rely on it.
ENTRYPOINT ["zpinit"]
