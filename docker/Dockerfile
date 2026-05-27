# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:24-alpine AS builder

RUN corepack enable && corepack prepare pnpm@11.4.0 --activate
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

# Install scripts dependencies (separate package.json with tsx + better-sqlite3).
# scripts/ has a npm package-lock.json, so install with npm here; pnpm is used
# only as the runtime invoker (`pnpm --prefix scripts run db:migrate`).
RUN cd scripts && npm install --omit=dev

# ── Stage 2: Runtime ───────────────────────────────────────────────
# Bare alpine + just `nodejs` (no npm, no yarn, no corepack). Alpine 3.23
# ships node 24.x — same major as the builder, so the better-sqlite3
# .node binary compiled in stage 1 loads cleanly. Pinned to keep node
# version + alpine ABI deterministic across releases.
FROM alpine:3.23 AS runtime

RUN apk add --no-cache nodejs

# zpinit + zpctl as PID 1 (replaces tini + entrypoint.sh).
# See https://github.com/0ploy/zpinit
COPY --from=ghcr.io/0ploy/zpinit:latest /usr/local/bin/zpinit /usr/local/bin/zpinit
COPY --from=ghcr.io/0ploy/zpinit:latest /usr/local/bin/zpctl  /usr/local/bin/zpctl

WORKDIR /app

# Copy built Nuxt output (includes server + node_modules for native deps)
COPY --from=builder /app/.output .output/

# Copy scripts with node_modules (tsx + better-sqlite3 for CLI tools)
COPY --from=builder /app/scripts scripts/

# Copy migrations (db-migrate.ts resolves server/database/migrations relative to CWD)
COPY --from=builder /app/server/database/migrations server/database/migrations/

# Copy zpinit config: globals + entrypoint.d scripts
COPY docker/zpinit/ /etc/zpinit/
RUN chmod +x /etc/zpinit/entrypoint.d/*.sh

# Create data directory for SQLite + uploads
RUN mkdir -p /data

# Environment defaults
ENV DATABASE_URL=/data/sqlite.db
ENV UPLOAD_DIR=/data/uploads
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
VOLUME /data

# zpinit runs entrypoint.d/*.sh in order (migrate → seed → cleanup),
# then exec's CMD as the server process.
ENTRYPOINT ["zpinit"]
CMD ["node", ".output/server/index.mjs"]
