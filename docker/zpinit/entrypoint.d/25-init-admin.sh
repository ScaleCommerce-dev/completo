#!/bin/sh
# Delegate to the shared shell wrapper used by both Docker and dev
# (see scripts/init-admin.sh). Kept as a thin shim so the actual logic
# has a single home.
exec /app/scripts/init-admin.sh
