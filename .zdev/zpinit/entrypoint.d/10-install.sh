#!/bin/sh
# zpinit entrypoint.d step — runs on every boot, before the dev server (CMD).
#
# Installing at boot (rather than once at image build) means every start
# converges on package.json: a fresh clone with no node_modules, a pulled
# dependency change, or a new machine all Just Work via `zdev start`.
# `pnpm install` also runs Nuxt's postinstall (`nuxi prepare`).
#
# The wait: going through Dockerfile/ENTRYPOINT bypasses the sync gate zdev
# injects into `command:`, so we wait for the Mutagen initial-sync marker here.
# Without it, install can race the file sync and not see package.json yet.
# zdev touches /.zdev-sync-ready after the first flush. Bounded by
# entrypoint_script_timeout (see zpinit.toml).
set -eu
cd /app

while [ ! -f /.zdev-sync-ready ]; do sleep 0.2; done

# Native build scripts are gated by `allowBuilds` in pnpm-workspace.yaml
# (better-sqlite3: true). It compiles from source here because there's no musl
# prebuild — .zdev/Dockerfile installs python3/g++/make for exactly this.
#
# confirmModulesPurge=false: when pnpm finds a node_modules it can't reuse
# (built by a different platform or pnpm version — e.g. the host's macOS tree
# leaking in, or a store left by an older image) it wants to delete and
# reinstall. That's the right call here, but it prompts first, and this boot
# path has no TTY, so it would otherwise die with
# ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY. Scoped to this call rather than
# setting CI=true, which would also change Nuxt and vitest behaviour.
pnpm install --config.confirmModulesPurge=false
