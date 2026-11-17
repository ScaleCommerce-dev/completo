#!/bin/sh
# Refresh the Swagger UI that /api/docs serves from public/swagger-ui/.
#
# Vendored rather than a dependency: the docs page needs two files, and a
# package in `dependencies` would put all of swagger-ui-dist (maps, ES bundles,
# standalone presets, about 10 MB) into the production image to serve them.
# The copy used to be hand-placed with no record of its version; VERSION says
# which release it is, and this script is how it moves.
#
#   ./scripts/update-swagger-ui.sh 5.35.0
#
# Run inside the container (`zdev exec app ./scripts/update-swagger-ui.sh X`):
# it needs npm, and downloads from the npm registry.
set -eu
version="${1:?usage: update-swagger-ui.sh <version>}"
cd "$(dirname "$0")/.."
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
(cd "$work" && npm pack "swagger-ui-dist@$version" --silent >/dev/null)
tar -xzf "$work"/swagger-ui-dist-*.tgz -C "$work"
cp "$work/package/swagger-ui-bundle.js" "$work/package/swagger-ui.css" public/swagger-ui/
cp "$work/package/LICENSE" public/swagger-ui/LICENSE
printf '%s\n' "$version" > public/swagger-ui/VERSION
# Readable by everyone: the production image serves these as a non-root user,
# and the copies come out of a temporary directory as owner-only.
chmod 644 public/swagger-ui/*
echo "public/swagger-ui is swagger-ui-dist $version"
