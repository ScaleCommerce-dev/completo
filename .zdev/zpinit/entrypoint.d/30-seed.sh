#!/bin/sh
# zpinit entrypoint.d step — runs after 20-migrate.sh, before the dev server.
#
# Provisions the two fixed dev logins and the demo project, so a fresh
# `zdev start` lands on a usable board instead of an empty install. The
# credentials are hardcoded in .zdev/config.yaml (dev-only, committed on
# purpose) and printed by `zdev info`.
#
# Every step is idempotent, so this is safe on every boot:
#   - user-create --skip-existing exits 0 when the user is already there
#   - db-seed.ts skips the demo project / AI skills when they already exist
#
# Users are created auto-verified by user-create.ts, which matters because
# .zdev/config.yaml sets SMTP_HOST (for Mailpit) and Completo gates login on a
# verified email whenever email is enabled.
#
# Never aborts the boot — a seeding hiccup shouldn't cost you the dev server.
set -eu
cd /app

warn() {
  echo
  echo "!!! =============================================================="
  echo "!!! DEMO DATA WAS NOT SEEDED: $1"
  echo "!!! The dev server starts anyway. Retry with:"
  echo "!!!   zdev migrate seed"
  echo "!!! =============================================================="
  echo
  exit 0
}

# Every script is invoked as `node scripts/*.ts`, the same way the prod
# entrypoint does it — Node strips types natively, so no tsx and no package
# manager is involved.
#
# Admin, from ADMIN_USER_* — the same single-source-of-truth path prod uses
# (init-admin.sh -> user-create.ts --from-env --skip-existing).
./scripts/init-admin.sh || warn "'scripts/init-admin.sh' failed"

# A second, non-admin user for testing member/permission behaviour. Three
# positionals with a non-'admin' trailing token, so it is created as a
# regular user.
if [ -n "${DEV_USER_EMAIL:-}" ] && [ -n "${DEV_USER_PASSWORD:-}" ]; then
  node scripts/user-create.ts \
    "$DEV_USER_EMAIL" "$DEV_USER_PASSWORD" "${DEV_USER_NAME:-Demo User}" \
    --skip-existing || warn "creating $DEV_USER_EMAIL failed"
fi

# Demo project + board + sample cards, attributed to the admin created above.
node scripts/db-seed.ts || warn "'node scripts/db-seed.ts' failed"

cat <<BANNER

  ─────────────────────────────────────────────
   Completo dev logins (also in \`zdev info\`)
     admin: ${ADMIN_USER_EMAIL:-<unset>} / ${ADMIN_USER_PASSWORD:-<unset>}
     user:  ${DEV_USER_EMAIL:-<unset>} / ${DEV_USER_PASSWORD:-<unset>}
  ─────────────────────────────────────────────

BANNER
