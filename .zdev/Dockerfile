# Completo dev image: Node 24 LTS + zpinit as PID 1.
#
# Deliberately a different base than docker/Dockerfile (the prod image).
# Prod optimises for size — bare `alpine` + `apk add nodejs`, ~109MB, no
# npm/corepack it never uses. Dev needs corepack (pnpm), a compiler for
# better-sqlite3 and tsx, and doesn't care about image size, so it starts
# from node:24-alpine instead. Different purposes, different bases.
#
# Mode 3 (supervise), same as the prod image: zpinit runs the scripts in
# .zdev/zpinit/entrypoint.d/ (install → migrate → seed) and then supervises
# services/*.toml, staying resident as PID 1.
#
# Supervised rather than exec'd specifically so the container cannot die on
# you mid-session: whatever the dev server does, zpinit is still PID 1 and
# `zdev exec app sh` still works. Combined with
# entrypoint_on_failure = "continue" (see zpinit/zpinit.toml), even a failed
# `pnpm install` leaves you a live container with the error in `zdev logs`
# instead of an exit-restart loop with nothing to attach to.
#
# .zdev is excluded from the Mutagen sync, so /etc/zpinit is the image's copy
# only: editing an entrypoint.d script takes effect after a rebuild. `zdev
# update` rebuilds when *this file's contents* change, not the build context,
# so touch this file (a comment is enough) whenever you edit entrypoint.d.
# See https://github.com/0ploy/zpinit
FROM node:24-alpine

# zpctl too, not just zpinit: supervise mode is only useful if you can drive
# it (`zpctl status`, `zpctl restart app`, `zpctl tail -f app`).
COPY --from=ghcr.io/0ploy/zpinit:0.5.5 /usr/local/bin/zpinit /usr/local/bin/
COPY --from=ghcr.io/0ploy/zpinit:0.5.5 /usr/local/bin/zpctl  /usr/local/bin/

# python3/g++/make: better-sqlite3 has no musl prebuild, so pnpm compiles it
# from source (pnpm-workspace.yaml allows its build script explicitly).
# Without these, `pnpm install` fails at boot.
RUN apk add --no-cache python3 g++ make

# Bake a concrete pnpm into the image rather than letting corepack fetch one
# on first use. Version tracks package.json's `packageManager` field.
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate

# Never block a non-TTY boot on corepack's "about to download" prompt.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

# No tsx and no npm needed: Node strips TypeScript natively (default since
# 22.18 — `process.features.typescript === 'strip'`), and scripts/*.ts use
# only erasable syntax with no relative imports, so `node scripts/foo.ts`
# just works. pnpm is the only package manager in this image.

COPY .zdev/zpinit/ /etc/zpinit/
RUN chmod +x /etc/zpinit/entrypoint.d/*.sh \
 && zpinit --check-config /etc/zpinit/

WORKDIR /app

# Deliberately NO CMD: an empty CMD selects supervise mode, which is what
# keeps zpinit resident as PID 1. The dev server is defined in
# .zdev/zpinit/services/10_app.toml instead.
#
# Note this also means .zdev/config.yaml must NOT set `command:` — zdev turns
# that into the container CMD, which would flip zpinit back to exec mode.
ENTRYPOINT ["zpinit"]
