# Completo — All the Toppings. None of the Mess.

Kanban board app. Nuxt 4 (SPA, `ssr: false`) + Nuxt UI 4 + Tailwind 4 + Drizzle + SQLite. Go CLI in `cli/`.

## About this file

Agent guidance: the decisions, invariants and traps that are *not* recoverable by reading the code, plus where to find the ones that are. It is not a design document — the reasoning behind a component lives in that component, and the measurement behind a rule lives in its test.

A rule here has to meet four conditions. **Name the mechanism, not the conclusion:** "a full-width rule crosses the avatar gutter" is checkable and bans one device; "no lines" is a conclusion that generalises past its evidence and bans devices nobody tested. **Be enforced by something that recomputes the property, not something that restates the value** — a guard that mirrors the number you set gives false confidence, which is worse than no guard. **Carry a measurement, a file reference or a test** — a claim with none gets deleted, not softened. **Be applied everywhere it is recorded:** updating one place in three is the same defect as a refactor that migrates one caller in three.

Before adding a line, ask whether it would stop a mistake that reading the relevant file would not. If not, cut it — every line here competes for attention on every task.

## Run everything in the container

`zdev start`, then **prefix every command with `zdev exec app`**. Not a preference:

- `node_modules` is in `mutagen.ignore` — the host has a *separate* dependency tree, so host installs, audits and tests inspect the wrong one.
- **There is no `.env`.** Dev secrets come from a 1Password Environment injected at container creation, so host-side `pnpm dev` starts without `NUXT_SESSION_PASSWORD`, OAuth or AI keys. After rotating them: `zdev update --refresh-secrets` — a plain restart will not pick them up.
- The database exists only at `/app/data/sqlite.db` in a named volume. Host `pnpm db:*` targets a database the app never reads.

**Dev data is disposable, so change it freely while testing.** `zdev down -v -f && zdev start` rebuilds from migrations + seed. Creating cards, moving them, renaming a board — none of it needs undoing, and carefully restoring state costs more than it is worth. Logins are printed by `zdev info`.

Host-only exceptions: `zdev`, `git`, and `cd cli && go test ./...` (the dev image has no Go toolchain).

Two traps in this setup have no code-level signal. **`.zdev/config.yaml` must not set `command:`** — zdev turns that into the container CMD, which flips zpinit out of supervise mode. And **editing `.zdev/entrypoint.d/` needs a rebuild**, because `.zdev` is excluded from the file sync and `zdev update` only rebuilds on Dockerfile *content* changes: touch `.zdev/Dockerfile` after editing an entrypoint script.

**Scripts run as `node scripts/foo.ts` — no tsx, no package manager,** because the prod runtime image has neither npm nor pnpm and the same command has to work in dev, in prod and on the host. Node strips types natively, which is erasable-syntax-only: **no `enum`, `namespace`, parameter properties or decorators in `scripts/*.ts`**, and relative imports would need explicit `.ts` extensions.

## Checking it in a browser

`/cmux-browser` first, `/chrome-devtools` only if unavailable. Reuse an open instance on `https://completo.0ploy.dev` rather than starting another.

**A wedged browser session serves the pre-mount SPA shell** — `#__nuxt` empty, `document.title` empty — which is indistinguishable from a client crash. Clean `pnpm lint` + clean `zdev logs app` + empty `#__nuxt` means open a fresh tab; it is not your code. (The real client-crash mode is a split Vue tree, and `dependency-singletons.test.ts` is the check for it.)

## Which tests to run

Measured, because the spread is 19×:

| | cost | for |
|---|---|---|
| `pnpm lint` | **5s** | the only thing that catches a broken `.vue` template, with a line number |
| `pnpm vitest run --project unit` | **1.4s** | everything under `tests/unit/` |
| `pnpm typecheck` | 7s | types and props — does **not** parse templates |
| `pnpm test` | **27s** | the above plus a build and the HTTP suite |

Frontend-only change → `lint` + `unit`. That ~6s is the whole safety net; the integration suite talks HTTP to a built server and cannot observe a Vue change except by failing to build. Touching `server/`, `shared/` or the schema → full `pnpm test`. Before committing → full `pnpm test`, once.

**If the full suite dies in `global-setup` with an opaque `Serialized Error`, run `pnpm lint`** — that is a template syntax error, and the full suite is the worst of the four at reporting it.

The suite **cannot see the client**. Upgrading nuxt 4.4.6 → 4.5.1 split the tree into two Vue copies and the app failed to mount while 481 tests, lint and typecheck stayed green. After any framework bump, load the app and check the console.

Two integration-suite traps: use `fetch(url('/path'))` when you need to inspect a non-2xx response, because the shared `$fetch` is ofetch and throws on one; and **`process.env.NODE_ENV` is inlined at build**, so runtime gating needs a custom env var.

## Dependencies

**One resolved version is not one bundled instance, and only the first is testable.** Nuxt UI *bundles* Tiptap — `UEditor` imports `@tiptap/core`, `@tiptap/pm`, `@tiptap/vue-3` and a dozen extensions from inside its own package, none of it hoisted — so our own mention node forces those packages into `dependencies` as well. `dependency-singletons.test.ts` guards the lockfile half: one resolved version per `@tiptap/*` and per stateful Vue package, and no range on our side that could drift off Nuxt UI's. Hence exact pins, never carets.

It **cannot see the bundler half.** With a single resolved version, Vite still pre-bundles our direct imports separately from Nuxt UI's internal ones and hands out two module instances. ProseMirror says so when it notices — `Adding different instances of a keyed plugin` — but `useEditor` builds its editor inside `onMounted`, so the usual symptom is an editor-shaped box containing nothing, with **no error anywhere**. That is why `nuxt.config.ts` keeps the Tiptap family out of `optimizeDeps`; a bare `<UEditor>` on a scratch page is the fastest way to tell this apart from a bug in our own code.

**`nuxt` and `@nuxt/ui` must agree on the `@unhead/vue` major.** They declare it independently, and when they disagree `@nuxt/ui`'s colors plugin injects a head nobody provided: every route 500s with `undefined is not an object (evaluating 'head.hooks')` before the app mounts, which looks nothing like a dependency problem. Measured: nuxt 4.5.1 wanted `^3.2.3` while @nuxt/ui 4.10.0 wanted `^2.1.15`, and the committed lockfile carried both — so the app kept working only until someone reinstalled. Check both sides before bumping either.

**`nuxt` is held on `~4.5.2` until a stable nitropack ships nitrojs/nitro#5017** (merged to v2 on 2026-11-10, after 2.13.6; the issue reporter confirmed it fixes this on 4.6.4 via a nightly). Lift the hold then, and run `pnpm typecheck` to confirm. 4.6 retypes the global `$fetch`, and a call whose response type is *inferred* through a generic helper — `mutate(() => $fetch(...))`, `withRefresh(...)`, or `$fetch(...) as T` — fails typecheck with TS2321 `Excessive stack depth`. Fixing one site moves the error to the next, so it is not a per-call bug (upstream: nuxt/nuxt#36813). The overflow is in nitropack's route-matching types (`MaxTuple`), which #5017 replaces. Bisected: nuxt 4.6.4 fails with nitropack, drizzle and vue-tsc each reverted; 4.5.2 with everything else current passes. The 4.6.3/4.6.4 security advisories were checked against this app — SSR off, one exact-path redirect rule, no caching, proxy rules or islands — and none reaches it on 4.5.2. `nuxt-auth-utils` 0.6 needs `nuxt/server` from 4.6, so it waits too.

**`pnpm update` does not re-resolve a transitive range it thinks is already satisfied.** After that bump it left ten `@tiptap/*` packages on the old version and `@tiptap/vue-3` present twice under two different cores, while reporting "Already up to date". Deleting `pnpm-lock.yaml` alone is not enough either: pnpm rebuilds it from `node_modules/.pnpm/lock.yaml` and reports "Already up to date" with the stale versions intact (measured: 24 `@tiptap/*@3.31` entries survived). Delete both, **inside the container** — a host-side delete reaches it only after the next sync, so a quick `zdev exec app pnpm install` still sees the old file. Note also that a `minimumReleaseAge` policy refuses packages published within the last few days.

## Core model

**Statuses and cards belong to projects, not views.** Boards and lists are views; cards have a `projectId` + `statusId` and reach a board through the `boardColumns` junction. Removing a column unlinks it — cards survive. **Deleting a status reassigns its cards rather than cascading:** `statuses/[id].delete.ts` refuses a non-empty status with 409 unless `moveToStatusId` names another status in the project, and refuses the project's last status outright. The FK cascade on `cards.statusId` stays, because project deletion reaches cards through both `projectId` and `statusId` and SQLite orders neither — so the handler is the *only* guard, and `tests/integration/statuses/delete.test.ts` counts cards after the fact rather than reading it.

Two different things are called "column": a **board column** is how a status appears on a board (`boardColumns`), a **field column** is which card field shows in a list table (`listColumns`).

- **Cards use INTEGER AUTOINCREMENT**, not UUID, so they can be `TK-42`. Everything else is UUID. Parse card ids with `Number()`.
- **Done + retention:** views *filter out* old done cards rather than deleting them; card counts exclude the done status; `null` retention keeps forever.
- **Positions** are integers, and a new item is `max(existing) + 1` — never `.length`.
- **Password sentinels** `'!oauth'`, `'!invited'` and `'!agent'` are unhashable by design.
- `isAdmin` grants a synthetic `{ role: 'owner' }`, and the API returns `role: 'admin'` for non-member admins — don't render it as a real project role. My Tasks is **not** admin-elevated.

## Security invariants

Each of these was a live vulnerability, and none has a code-level signal:

- **Scope `email_verification_tokens` by `purpose`.** One table serves verification, password reset and account setup. Verify and reset both *sign the caller in*, so an unscoped consumer let an emailed "confirm your address" link be POSTed to `/auth/reset-password` to take the account over — a forwarded message or a shared inbox was enough. `lookupVerificationToken()` takes purpose as a required argument. A new flow owes a new purpose value and a consumer that names it. Setup additionally checks `isPendingSetup()`.
- **Never serve `attachments.mimeType`** — it is whatever the client declared. Derive from the filename (`serveContentType()`), send `nosniff`, and only use `Content-Disposition: inline` for `isInlineSafe()` types. Echoing it made every upload stored XSS on the app origin, which an attacker turns into a non-expiring API token via `POST /api/user/tokens`; `HttpOnly` does not help, because the attack runs same-origin requests rather than reading the cookie. `isAllowedMimeType()` is not the defence and cannot be — it matches the filename and ignores the declared type.
- **404, not 403,** for non-member access, and every card/tag/board endpoint validates that the resource belongs to the project in the URL.
- **A page under `app/pages/auth/` needs an entry in `PUBLIC_ROUTES`** (`shared/utils/auth-routes.ts`). With `ssr: false` the global middleware runs on every navigation with no way to opt out from the page, so a missing entry redirects anonymous visitors to `/login` *and* drops the token in the query string — which is how password recovery was unreachable while every server-side test passed. Keep one-shot emailed links out of `SIGNED_IN_REDIRECT_ROUTES` for the same reason.
- **OAuth tokens are bound to the client and the resource, and a code dies on first read.** `server/utils/oauth-server.ts`: `redirect_uri` is an exact match against the registration (a prefix match hands a registered `https://x/cb` to `https://x/cb?..` on an attacker's path), PKCE is S256 only, refresh and revoke check the grant's `client_id` (a public client has no secret, so that is the only thing binding a leaked refresh token), `resource` must equal the MCP URL, and the code row is deleted before any check so a failed exchange and a replay are equally gone. A metadata-document `client_id` must be `https` with a path and name itself; the server never fetches a bare host, an IP, a non-default port or a name resolving to an internal address, and follows no redirect — a public document answering `302` to `http://10.…` was a blind SSRF. `tests/integration/oauth.test.ts` has one test per boundary.
- **An agent is only a member of projects its manager is in** (an admin's agents: any), or an owner adding Bob's agent to a project Bob is not in lets Bob read it through the agent's token. Every path that changes either side re-applies it: adding the agent, removing its manager, a transfer, an admin manager losing admin (`server/utils/agents.ts`). **Agents are never admin, project owner, or an email or notification recipient**, refused by explicit `kind` checks: the `'!agent'` hash and the `@agents.invalid` address make most paths unreachable, which is not the same as refused. `tests/integration/agents/` writes `is_admin` and `email_notifications` onto an agent row to show the check, not the flag, holds.
- User search returns names, never email.
- The domain allowlist restricts **self-registration only** — invitations and admin-created users bypass it.

## Schema changes

**Every schema change needs a committed migration.** Edit `server/database/schema.ts` → `zdev migrate generate` → **commit the `.sql` *and* the `meta/` changes**, because `meta/_journal.json` is what the migrator reads and a `.sql` without its journal entry silently never runs.

- **Never `drizzle-kit push` against a database you keep.** It applies the schema without recording a migration, which permanently poisons that DB — `db:migrate` afterwards either restarts at `0000` and dies on `table already exists`, or dies on `duplicate column name`. Both verified. The fix is to discard the database.
- **Product defaults ship via a data migration; the seed is demo content only.** `db:migrate` is the only step guaranteed to run once on every install. Anything in `db-seed.ts` reaches fresh installs *only*, and seed inserts must be guarded per row by name — "does this table have any rows" meant a new default was skipped forever on any install that already had one.

## Design system

**The brand is connect2scale's company styleguide** (handoff repo `connect2scale-design-handoff`). Its tokens are copied verbatim into `app/assets/css/connect2scale-tokens.css` — never edit that file; change a value in the handoff and copy it over. `main.css` › CONNECT2SCALE maps Nuxt UI's `--ui-*` onto `--c2s-*`, re-declared on `:root, .light, .dark` because a `var()` resolves where it is declared and the always-dark shell is a `.dark` subtree inside a light page. `plugins/c2s-theme.client.ts` keeps `class="c2s-theme" data-theme` and `data-input-modality` on `<html>`. Deliberate deviations from the guideline are listed in `docs/connect2scale.md`; a new one goes there with its reason. Toast display time is set app-wide by `plugins/toast-duration.client.ts` (rule in `utils/toast-duration.ts`) — don't pass a `duration` unless a toast genuinely needs a different one. UI copy uses no en/em dashes (`08-texte.md`).

`app/app.config.ts` names all six roles (`primary: berry`, `neutral: ink` are ramps built through the guideline's values in `main.css`). **`bg-primary` is the text-safe accent** — in dark mode a light pink — so the brand magenta *fill* is `bg-accent`, as the primary button uses. Reach markup only through semantic tokens — `bg-default` / `bg-muted` / `bg-elevated` / `bg-accented`, `text-default` / `toned` / `muted` / `dimmed` / `highlighted`, `border-default` / `border-accented`, and `*-primary` / `error` / `warning` / `success`. A raw palette utility (`zinc-500`, `red-50`) means dark mode has to be maintained by hand; `design-tokens.test.ts` fails on one in any prefix, variant or family.

**Scales are closed sets**, all declared in `app/assets/css/main.css` with the reasoning beside them:

- **Type** — Plus Jakarta Sans for UI, DM Mono for code and ids, Inter for figures; nothing else. Working steps 10 / 12 / 13 / 14 / 16 / 18, `text-dialog` 22 for dialog titles, plus a **display tier** 26 / 32 / 38. A display step needs a surface with no work to compete with, so it is banned on the board, lists, cards and the panel — with one imposed exception: the 26px page title in `UiPage`, which the guideline fixes on every page.
- **Radius** encodes containment *depth*, on the guideline's values: `md` 6 inside a surface, `lg` 8 buttons and menus, `field` 9 text fields and the primary button, `xl` 12 cards and columns, `2xl` 16 dialogs.
- **Elevation** — `shadow-raise` / `float` / `drag` / `dialog`. Never a raw Tailwind shadow: its dark value would be maintained by hand. A custom token name that a Nuxt UI theme must *override* has to be registered in `app.config.ts` › `tv.twMergeConfig`, or tailwind-merge keeps the theme's class beside it (measured: every dialog rendered at 8px and `shadow-lg`).
- **The shell** — sidebar and topbar are always dark (`dark c2s-shell`), the page is `bg-canvas` inside a content area with an 18px top-left corner, and cards on it need `bg-default` (a transparent card on canvas is the failure mode). Page title, record controls and actions live in `UiPage`'s page header inside the content area; the topbar carries only the breadcrumb (`crumbs` + `title`) and global actions. The sidebar lights the one row whose address is the longest prefix of the route (a starred project stays lit on its boards). Sidebar size is in px, set on `UDashboardGroup` (Nuxt UI ignores `unit` on the sidebar itself). Inside the shell, `bg-canvas` resolves to the shell hover, because a content-area hover there was light-on-light.
- **Tracking** — `tracking-label` for small uppercase labels, `tracking-heading` for chrome titles, `tracking-name` for a record's own name.
- The **dark surface ramp** comes from the guideline's dark tokens, which keep six semantic steps distinct — Nuxt UI's own defaults collapse them onto three. `border-default` on `bg-muted` is simply correct — don't reach for `border-accented` to make a border visible, that spends the emphasis step on nothing.

**A failing design guard asks for a reason, not a retreat.** The scales are closed so that additions get argued, not so the current design is frozen. Every guard that can collide with legitimate design work carries a named exemption list (`OFF_SCALE`, `OFF_RAMP`, `ALLOWED`, `GRADIENT_BRAND_MOMENTS`) or derives from a declaration in `main.css` — extending the list, or retuning the declaration, with the reason written beside the entry in the same change, **is the intended workflow**, not a workaround. Two responses are defects: shipping the worse design to keep a test green, and quieting a guard by deleting its mechanism or widening a pattern.

**User colour goes through `.swatch*`, which sets lightness and keeps hue** (`oklch(from var(--swatch) L c h)`). Mixing toward black cannot fix a dark stored hex, and the palette offers dark ones on purpose. `UiAvatar` is every person's avatar; a bare `UAvatar` is a grey disc beside a tinted one.

**Aesthetic:** "Trello meets Linear" — an instrument panel. Chrome is neutral hairlines; the only saturated pixels carry data. Decorative *paint* gradients read as brand moments, so they live where the brand is the content — the auth and error pages, and AI surfaces. A gradient used as a mask (the board's and panel's scroll-edge fades) is not paint and is fine anywhere.

**One overlay form per object.** A card is a panel — `CardModal`, the app's only `USlideover` — because the board *reveals the card's column beside it* (`KanbanBoard.revealColumn`, measured in `card-panel.test.ts`), so reading a card and then moving it never means closing anything. Nothing else has a surface behind it that the task needs, so everything else is a centred dialog through `ui/Modal.vue`. The rule is per **object**, not per interaction: card create and card edit are both the panel, because a user learns one shape per thing rather than one per verb. Where an object needs a second placement — the card at its own URL, `ProjectForm` on `projects/new`, a confirmation raised from inside a panel, where a nested dialog lands *behind* it (`CardModal`'s closing comment) — it is the same component mounted differently, never a second design. The tracker interface keeps that card page, frames it as one surface with the properties in a hairline rail and the issue in a reading column, and adds parent, sub-issues, relations, project and milestone around the same properties, editors and comments (`useTrackerIssue`, `components/tracker/issue/`), because there is no board behind an issue there either.

**Two interfaces, one data model.** Settings › Interface switches the whole workspace between Standard and Tracker (`useWorkspaceSettings().isTracker`, loaded by `middleware/interface.global.ts` before any page sets up). Both interfaces share the typography, colours and tokens above; Tracker differs in layout and information architecture only. A page that differs per interface either switches between two components so each runs only its own fetches (`pages/projects/index.vue`), or gates in place where tests read the page file or the page's own data serves both (`my-tasks.vue`, `projects/[slug]/index.vue`, the card page). Standard must render exactly as before: an upstream test that changes is a gate that leaked.

**Chrome inside the form follows the commit contract, and there are three.** Editing something that already exists commits per field, with no Save and no Cancel — closing means done, which is why `CardModal` edit mode has no footer at all. Creating commits once and Cancel discards. Destroying confirms. So a dialog is a transaction only while its object does not exist yet; a *field*-level commit button is consistent with the first contract, not an exception to it — the panel's description carries one, chosen per field by how irritating a stray commit would be. Live-apply is not a claim of reversibility: view config is safe because removing a board column unlinks a status and cards belong to the project, not because live-apply undoes anything.

`overlay-forms.test.ts` derives the host of every overlay form from `app/**/*.vue`, and fails on a second `USlideover`, any `UDrawer`, or a raw `<UModal>` outside `ui/Modal.vue`. Its `MIGRATION_OWED` list is a debt list, not an exemption list: it asserts both directions, so migrating a file and leaving its entry behind fails too. Menus (`UPopover`, `UDropdownMenu`) are a separate vocabulary and deliberately unguarded — they attach to their trigger, carry no title, and commit nothing.

**The editor is styled by Nuxt UI's `editor` theme, never by `prose`.** `UEditor` ships a complete content stylesheet for ProseMirror's DOM — headings, lists, code, quotes, images, selection — so adding Tailwind Typography on top puts two rulesets on one element: measured, that gives task lists a bullet beside the checkbox with the label on the next line, and tables no borders. Tables and task lists are the gap, because they arrive with extensions Nuxt UI does not bundle; they are themed in `app.config.ts` under `ui.editor.slots.base`, which is where the official template puts them too. Heading sizes are pinned there as well: the theme reaches for `text-2xl`/`text-3xl`, which this app has redefined as the display tier that the panel bans, so they are matched to what `ProseDescription` renders instead — an editor whose heading changes size on save is not WYSIWYG.

Reach for `app/components/ui/*` and `FieldMenu` before hand-rolling; Nuxt UI v4 is fully MIT, so `UEmpty`, `UUser`, `UAlert`, `UKbd` and the `UDashboard*` family are all available.

## CSS traps

These have no single file to host the comment:

- **`theme()` does not work in scoped CSS** — Tailwind 4 uses `var(--color-*)`.
- **Focus is stated once, in `main.css`, by the connect2scale model.** An unlayered reset clears every outline — including Nuxt UI's, which it hangs on a `::before` — and rules keyed on `data-input-modality` draw a 2px `--c2s-focus` outline after keyboard input and a 1px neutral one after a click into a field. So **don't write `focus:*` on an element.** A composite field — an editor shell, a quick-add card, a row-table row — carries `data-focus-field` (or `="inset"` where a rounded `overflow-hidden` group would clip it), and gets one line round the shell instead of one round its input. Nuxt UI fields keep their resting ring on focus (`FIELD_FOCUS` in `app.config.ts`), or they would draw a second line. **Focus is never a fill.** Two named exceptions carry a meaning rather than a style: `focus:border-error*` on the type-the-name-to-delete confirmations, `focus:border-secondary` on the agent briefing. `outline-none` is never needed and is a test failure.
- **Two utilities for one property on one element is a coin flip** decided by `@theme` declaration order, not by which you wrote last — so the *later-declared* token wins whatever the class attribute says. `design-tokens.test.ts` › `one utility per property` derives the property per utility and fails on it; a lone `!` is the exemption, because that makes the winner declared. The token migration reintroduced this 45 times by rewriting `X dark:Y` to `X Y`.
- **`shared/utils/` is auto-imported for Nitro but not for app components** — a `.vue` file must `import { … } from '#shared/utils/…'` or the identifier is silently undefined. **A new file there needs a dev-server restart** (`zdev exec app zpctl restart app`); until then server code throws a runtime `X is not defined` while `pnpm test` passes, because the suite builds fresh.
- **Icon names in a `.ts` module are not found by Nuxt Icon** — `clientBundle.scan` globs templates only. `nuxt.config.ts` extends `globInclude` to cover it; watch the "client bundle consist of N icons" line.

## Fetching and mutations

Pages use `useFetch()`, composables `$fetch()`. Refresh after mutations — **except card mutations**, which patch the local row and reconcile with the response (`useViewData`). Don't add `refresh()` back: it made every one-click edit refetch the whole view.

**`useViewData` must fetch with `deep: true`.** `useFetch` defaults to a `shallowRef`, so a patched row mutates something Vue never sees — the request fires, the database updates, and the board keeps rendering the old value until an unrelated re-render flushes it. That makes it intermittent and easy to "verify" as working.

## Changelog and releases

`CHANGELOG.md` uses `## vX.Y.Z` sections, latest first, with `### App`, `### CLI` and where needed `### Upgrading` and `### Dev`. Add to `## Unreleased`, creating it if absent; at release, rename it and **don't add an empty one back**.

**A commit is not the unit.** `### App` is read by people who never see the repository: a new capability, changed behaviour, or a bug they could have hit *in a version they ran*. Three failure modes to avoid:

- **A bug introduced and fixed between two releases never happened** — delete the note with the bug.
- **One user-visible change is one entry**, however many commits it took.
- **"We unified six implementations" is not a user-facing sentence.** Say what they now see.

Refactors, renames, test and doc changes and dependency bumps are not entries; if a contributor needs them, that is `### Dev`.

Before tagging: bump `package.json`, rename `## Unreleased`, update `README.md`. Then `git tag vX.Y.Z && git push origin vX.Y.Z`.

**What the tag runs** (`.github/workflows/release-build.yml`): `ci` first checks that `CHANGELOG.md` has a section whose heading is exactly the tag (`## v0.14.0` or `## v0.14.0 (date)`) and that `package.json` carries the same version, and fails the release before anything is pushed if not. It then lints, typechecks and tests; `build-docker` pushes `ghcr.io/scalecommerce-dev/completo:<version>` and `:latest`; `build-cli` builds five CLI binaries and checks the linux-amd64 one reports the tag (an `-X` path that matches no variable is silently ignored and ships a `dev` CLI); `release` writes `checksums.txt`, which `install.sh` verifies against, and publishes the release with `.github/release-body-header.md` plus the tag's section.

**Re-running a failed release:** `gh workflow run release-build.yml -f tag=vX.Y.Z`. The workflow file comes from `main`, so a CI fix there applies, but every job checks out the tag: the code is always the tagged code. A fix to the code or the CHANGELOG needs a new tag. Note that `build-docker` may already have pushed `:latest` before a later job failed.

Actions are pinned to commit SHAs (the release job can push images and publish releases). To bump one, dereference the new tag with `gh api repos/<owner>/<repo>/commits/<tag> --jq .sha` and keep the version in the trailing comment.

## Where the reasoning lives

Don't reconstruct a decision from scratch, and don't re-litigate one without reading why it was made:

- **A component's own comments** carry the alternatives that were tried and why they failed — `CommentList`, `CardProperties`, `useFileDrop`, `useTagOverflow`, `board-nav` are all substantially prose. A recorded rejection binds only while its mechanism still applies: it is context to argue with, not a veto on the next redesign. A redesign that removes the premise re-opens the option — and owes the prose an update, not obedience.
- **`main.css`** carries every token's measurement.
- **`tests/unit/*.test.ts`** carry the numbers, and the good ones recompute rather than restate.
- **Registries** are single-sourced and guarded: `shared/utils/list-fields.ts` (what a list column can be), `card-fields.ts` (what a board card can show — it stores the fields that are **off**, so a new field appears by default), `ai-skills.ts` (skill scopes).
- `server/assets/openapi.json` must stay in sync with endpoints, for headless API usage only.
- **`/mcp` is a thin layer over the REST API, never a second one.** `server/mcp/tools.ts` reaches every handler through `event.$fetch` with the caller's own headers, so permissions, validation and notifications are the handlers' and are tested once. A tool owes the API nothing but names-to-ids and a compact shape; a tool that queries `db` directly has bypassed every guard in `server/utils/resolvers.ts`. `tests/integration/mcp.test.ts` drives it as a client would, by raw JSON-RPC.
- `skills/completo/SKILL.md` is the in-repo copy of the agent skill — update it when CLI commands change.

Docs: [Nuxt](https://nuxt.com/llms.txt) · [Nuxt UI](https://ui.nuxt.com/llms.txt) · [nuxt-auth-utils](https://raw.githubusercontent.com/atinux/nuxt-auth-utils/refs/heads/main/README.md)
