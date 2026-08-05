# Database migrations — dev convenience wrapper. Named `migrate` to avoid
# colliding with the built-in `zdev db` (Adminer).
#
# Everything here is an alias for the same `node scripts/*.ts` commands the
# container runs at boot and prod runs in its entrypoint — nothing dev-only
# happens behind your back. Pending migrations are already applied on every
# boot (.zdev/zpinit/entrypoint.d/20-migrate.sh), so plain `zdev migrate` is
# for the mid-session case: you just generated one and don't want to restart.
#
#   zdev migrate            apply pending migrations
#   zdev migrate generate   diff schema -> new SQL migration (then COMMIT it)
#   zdev migrate seed       provision dev admin + demo user + demo project
#   zdev migrate cleanup    remove orphans, expired tokens, then VACUUM
#
# Every schema change needs a committed migration: edit schema.ts, then
# `zdev migrate generate`, then commit the .sql AND the meta/ changes.
#
# There is deliberately no `push` alias here — `drizzle-kit push` records no
# migration and permanently poisons the database it runs against. See
# "Schema Changes & Migrations" in CLAUDE.md.

[no-exit-message]
migrate *args:
    #!/usr/bin/env sh
    case "{{args}}" in
      "")       zdev exec app node scripts/db-migrate.ts ;;
      generate) zdev exec app pnpm exec drizzle-kit generate ;;
      seed)     zdev exec app sh /etc/zpinit/entrypoint.d/30-seed.sh ;;
      cleanup)  zdev exec app node scripts/db-cleanup.ts ;;
      *)        echo "usage: zdev migrate [generate|seed|cleanup]" >&2; exit 2 ;;
    esac
