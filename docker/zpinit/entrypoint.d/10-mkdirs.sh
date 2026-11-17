#!/bin/sh
set -eu

DATA_DIR="$(dirname "$DATABASE_URL")"
mkdir -p "$DATA_DIR" "$UPLOAD_DIR"

# The server and the scripts below run as `completo`. A volume created by an
# image that ran as root holds root-owned files, which the app could then read
# but not write; hand over whatever is not ours yet (a no-op after the first
# boot, so a large upload directory costs one `find`).
if [ "$(id -u)" = 0 ]; then
  find "$DATA_DIR" "$UPLOAD_DIR" ! -user completo -exec chown completo:completo {} +
fi
