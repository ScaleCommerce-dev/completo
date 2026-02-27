# ── Stage 1: Build ──────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN apk add --no-cache python3 g++ make

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# Install scripts dependencies (separate package.json with tsx + better-sqlite3)
RUN cd scripts && npm install --omit=dev

# ── Stage 2: Runtime ───────────────────────────────────────────────
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy built Nuxt output (includes server + node_modules for native deps)
COPY --from=builder /app/.output .output/

# Copy scripts with node_modules (tsx + better-sqlite3 for CLI tools)
COPY --from=builder /app/scripts scripts/

# Copy migrations (db-migrate.ts resolves server/database/migrations relative to CWD)
COPY --from=builder /app/server/database/migrations server/database/migrations/

# Copy entrypoint
COPY docker/entrypoint.sh docker/entrypoint.sh
RUN chmod +x docker/entrypoint.sh

# Create data directory for SQLite + uploads
RUN mkdir -p /data

# Environment defaults
ENV DATABASE_URL=/data/sqlite.db
ENV UPLOAD_DIR=/data/uploads
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000
VOLUME /data

ENTRYPOINT ["./docker/entrypoint.sh"]
