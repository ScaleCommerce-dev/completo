#!/bin/sh
# Provision the admin user from ADMIN_USER_* env vars. Used by both:
#  - Docker entrypoint (env from `docker run -e ...`)
#  - `pnpm db:init-admin` in dev (env loaded from .env via dotenv inside
#    user-create.ts, not via shell `source` — keeps any shell metachars
#    in .env values from being evaluated).
# No fallback admin is provisioned if env vars are absent — the tsx
# script exits 0 with a "skipping" log line in that case.

set -eu
cd "$(dirname "$0")/.."
exec node ./scripts/node_modules/.bin/tsx scripts/user-create.ts --from-env --skip-existing
