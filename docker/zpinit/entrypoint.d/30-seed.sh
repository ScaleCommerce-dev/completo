#!/bin/sh
set -eu

# As the app user, so the files SQLite creates beside the database (WAL, SHM)
# are the server's to write (see 10-mkdirs.sh).
if [ "$(id -u)" = 0 ]; then exec su-exec completo node scripts/db-seed.ts; fi
exec node scripts/db-seed.ts
