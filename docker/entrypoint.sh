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

# Auto-create initial user from env (idempotent — skips if user exists)
if [ -n "$INIT_USER_EMAIL" ] && [ -n "$INIT_USER_PASSWORD" ]; then
  set -- "$INIT_USER_EMAIL" "$INIT_USER_PASSWORD"
  [ -n "$INIT_USER_NAME" ] && set -- "$@" "$INIT_USER_NAME"
  case "$INIT_USER_ADMIN" in
    1|true|TRUE|yes|YES) set -- "$@" admin ;;
  esac
  set -- "$@" --skip-existing
  $PM --prefix scripts run user:create -- "$@"
elif [ -n "$INIT_USER_EMAIL" ] || [ -n "$INIT_USER_PASSWORD" ]; then
  echo "Warning: INIT_USER_EMAIL and INIT_USER_PASSWORD must both be set to auto-create a user" >&2
fi

# Start the server (exec replaces shell for proper signal handling)
exec node .output/server/index.mjs
