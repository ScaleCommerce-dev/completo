#!/bin/sh
set -eu

node ./scripts/node_modules/.bin/tsx scripts/db-cleanup.ts
