#!/bin/sh
# zpinit entrypoint.d step — runs after 10-install.sh (which put node_modules
# in place) and before the dev server (CMD).
#
# Invoked as `node scripts/db-migrate.ts` — byte-for-byte the same command the
# prod entrypoint runs (docker/zpinit/entrypoint.d/20-migrate.sh). Node strips
# types natively, so this needs neither tsx nor a package manager, which is
# what makes one command work in both places (prod has no pnpm at all).
# For the dev convenience wrapper, see `zdev migrate` (.zdev/commands/).
#
# Applies committed migration SQL. Every schema change needs one: run
# `zdev migrate generate`, commit the .sql and meta/ changes, and the next
# boot applies it. Never `drizzle-kit push` against this DB — it records no
# migration and permanently poisons it (see CLAUDE.md).
#
# This step never aborts the boot. A broken migration would otherwise brick the
# container — no dev server, and no way to `zdev exec app sh` in to fix it,
# since the boot would just re-run the same failing script. On failure it warns
# loudly and lets the dev server start anyway; that's the same state you'd be
# in having forgotten to migrate, which is debuggable.
set -eu
cd /app

warn() {
  echo
  echo "!!! =============================================================="
  echo "!!! MIGRATIONS WERE NOT APPLIED: $1"
  echo "!!! The dev server starts anyway. Fix it, then run:"
  echo "!!!   zdev migrate"
  echo "!!! =============================================================="
  echo
  exit 0
}

# SQLite: no service to wait for, but the file's parent dir must exist. In dev
# DATABASE_URL points into the `data` named volume (see .zdev/config.yaml) so
# the DB and its WAL files stay out of the Mutagen sync — SQLite over a synced
# bind mount risks WAL corruption.
mkdir -p "$(dirname "${DATABASE_URL:-/app/data/sqlite.db}")" "${UPLOAD_DIR:-/app/data/uploads}"

node scripts/db-migrate.ts || warn "'node scripts/db-migrate.ts' failed — see the error above"
