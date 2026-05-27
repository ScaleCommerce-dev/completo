#!/bin/sh
set -eu

mkdir -p "$(dirname "$DATABASE_URL")" "$UPLOAD_DIR"
