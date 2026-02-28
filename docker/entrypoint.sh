#!/bin/sh
set -a
[ -f .env ] && source .env
set +a

set -e
# Detect package manager
if command -v pnpm >/dev/null 2>&1; then
  PM="pnpm"
elif command -v npm >/dev/null 2>&1; then
  PM="npm"
else
  echo "Error: neither pnpm nor npm found" >&2
  exit 1
fi

# Ensure data directories exist
mkdir -p "$(dirname "$DATABASE_URL")" "$UPLOAD_DIR"

# Run migrations (idempotent — safe on every start)
$PM --prefix scripts run db:migrate

# Seed demo data (idempotent — skips anything that already exists)
$PM --prefix scripts run db:seed

# Clean up expired tokens and orphan records
$PM --prefix scripts run db:cleanup

# Start the server (exec replaces shell for proper signal handling)
exec node .output/server/index.mjs
