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

## Core model

**Statuses and cards belong to projects, not views.** Boards and lists are views; cards have a `projectId` + `statusId` and reach a board through the `boardColumns` junction. Removing a column unlinks it — cards survive. Deleting a status cascades.

Two different things are called "column": a **board column** is how a status appears on a board (`boardColumns`), a **field column** is which card field shows in a list table (`listColumns`).

- **Cards use INTEGER AUTOINCREMENT**, not UUID, so they can be `TK-42`. Everything else is UUID. Parse card ids with `Number()`.
- **Done + retention:** views *filter out* old done cards rather than deleting them; card counts exclude the done status; `null` retention keeps forever.
- **Positions** are integers, and a new item is `max(existing) + 1` — never `.length`.
- **Password sentinels** `'!oauth'` and `'!invited'` are unhashable by design.
- `isAdmin` grants a synthetic `{ role: 'owner' }`, and the API returns `role: 'admin'` for non-member admins — don't render it as a real project role. My Tasks is **not** admin-elevated.

## Security invariants

Each of these was a live vulnerability, and none has a code-level signal:

- **Scope `email_verification_tokens` by `purpose`.** One table serves verification, password reset and account setup. Verify and reset both *sign the caller in*, so an unscoped consumer let an emailed "confirm your address" link be POSTed to `/auth/reset-password` to take the account over — a forwarded message or a shared inbox was enough. `lookupVerificationToken()` takes purpose as a required argument. A new flow owes a new purpose value and a consumer that names it. Setup additionally checks `isPendingSetup()`.
- **Never serve `attachments.mimeType`** — it is whatever the client declared. Derive from the filename (`serveContentType()`), send `nosniff`, and only use `Content-Disposition: inline` for `isInlineSafe()` types. Echoing it made every upload stored XSS on the app origin, which an attacker turns into a non-expiring API token via `POST /api/user/tokens`; `HttpOnly` does not help, because the attack runs same-origin requests rather than reading the cookie. `isAllowedMimeType()` is not the defence and cannot be — it matches the filename and ignores the declared type.
- **404, not 403,** for non-member access, and every card/tag/board endpoint validates that the resource belongs to the project in the URL.
- **A page under `app/pages/auth/` needs an entry in `PUBLIC_ROUTES`** (`shared/utils/auth-routes.ts`). With `ssr: false` the global middleware runs on every navigation with no way to opt out from the page, so a missing entry redirects anonymous visitors to `/login` *and* drops the token in the query string — which is how password recovery was unreachable while every server-side test passed. Keep one-shot emailed links out of `SIGNED_IN_REDIRECT_ROUTES` for the same reason.
- User search returns names, never email.
- The domain allowlist restricts **self-registration only** — invitations and admin-created users bypass it.

## Schema changes

**Every schema change needs a committed migration.** Edit `server/database/schema.ts` → `zdev migrate generate` → **commit the `.sql` *and* the `meta/` changes**, because `meta/_journal.json` is what the migrator reads and a `.sql` without its journal entry silently never runs.

- **Never `drizzle-kit push` against a database you keep.** It applies the schema without recording a migration, which permanently poisons that DB — `db:migrate` afterwards either restarts at `0000` and dies on `table already exists`, or dies on `duplicate column name`. Both verified. The fix is to discard the database.
- **Product defaults ship via a data migration; the seed is demo content only.** `db:migrate` is the only step guaranteed to run once on every install. Anything in `db-seed.ts` reaches fresh installs *only*, and seed inserts must be guarded per row by name — "does this table have any rows" meant a new default was skipped forever on any install that already had one.

## Design system

`app/app.config.ts` is the source of truth for the brand and names all six roles. Reach markup only through semantic tokens — `bg-default` / `bg-muted` / `bg-elevated` / `bg-accented`, `text-default` / `toned` / `muted` / `dimmed` / `highlighted`, `border-default` / `border-accented`, and `*-primary` / `error` / `warning` / `success`. A raw palette utility (`zinc-500`, `red-50`) means dark mode has to be maintained by hand; `design-tokens.test.ts` fails on one in any prefix, variant or family.

**Scales are closed sets**, all declared in `app/assets/css/main.css` with the reasoning beside them:

- **Type** — six working steps 10 / 12 / 13 / 14 / 16 / 20, plus a **display tier** 26 / 32 / 38 in `font-display` (JetBrains Mono). A display step needs a surface with no work to compete with, so it is banned on the board, lists, cards and the panel.
- **Radius** encodes containment *depth*, not role: `md` inside a surface, `lg` a surface, `xl` a container of surfaces.
- **Elevation** — `shadow-raise` / `float` / `drag`. Never a raw Tailwind shadow: its dark value would be maintained by hand.
- **Tracking** — `tracking-label` for small uppercase labels, `tracking-heading` for chrome titles, `tracking-name` for a record's own name.
- The **dark surface ramp is overridden** because Nuxt UI's defaults collapse six semantic tokens onto three values. `border-default` on `bg-muted` is now simply correct — don't reach for `border-accented` to make a border visible, that spends the emphasis step on nothing.

**A failing design guard asks for a reason, not a retreat.** The scales are closed so that additions get argued, not so the current design is frozen. Every guard that can collide with legitimate design work carries a named exemption list (`OFF_SCALE`, `OFF_RAMP`, `ALLOWED`, `GRADIENT_BRAND_MOMENTS`) or derives from a declaration in `main.css` — extending the list, or retuning the declaration, with the reason written beside the entry in the same change, **is the intended workflow**, not a workaround. Two responses are defects: shipping the worse design to keep a test green, and quieting a guard by deleting its mechanism or widening a pattern.

**User colour goes through `.swatch*`, which sets lightness and keeps hue** (`oklch(from var(--swatch) L c h)`). Mixing toward black cannot fix a dark stored hex, and the palette offers dark ones on purpose. `UiAvatar` is every person's avatar; a bare `UAvatar` is a grey disc beside a tinted one.

**Aesthetic:** "Trello meets Linear" — an instrument panel. Chrome is neutral hairlines; the only saturated pixels carry data. Decorative *paint* gradients read as brand moments, so they live where the brand is the content — the auth and error pages, and AI surfaces. A gradient used as a mask (the board's and panel's scroll-edge fades) is not paint and is fine anywhere.

**One overlay form per object.** A card is a panel — `CardModal`, the app's only `USlideover` — because the board *reveals the card's column beside it* (`KanbanBoard.revealColumn`, measured in `card-panel.test.ts`), so reading a card and then moving it never means closing anything. Nothing else has a surface behind it that the task needs, so everything else is a centred dialog through `ui/Modal.vue`. The rule is per **object**, not per interaction: card create and card edit are both the panel, because a user learns one shape per thing rather than one per verb. Where an object needs a second placement — the card at its own URL, `ProjectForm` on `projects/new`, a confirmation raised from inside a panel, where a nested dialog lands *behind* it (`CardModal`'s closing comment) — it is the same component mounted differently, never a second design.

**Chrome inside the form follows the commit contract, and there are three.** Editing something that already exists commits per field, with no Save and no Cancel — closing means done, which is why `CardModal` edit mode has no footer at all. Creating commits once and Cancel discards. Destroying confirms. So a dialog is a transaction only while its object does not exist yet; a *field*-level commit button is consistent with the first contract, not an exception to it — the panel's description carries one, chosen per field by how irritating a stray commit would be. Live-apply is not a claim of reversibility: view config is safe because removing a board column unlinks a status and cards belong to the project, not because live-apply undoes anything.

`overlay-forms.test.ts` derives the host of every overlay form from `app/**/*.vue`, and fails on a second `USlideover`, any `UDrawer`, or a raw `<UModal>` outside `ui/Modal.vue`. Its `MIGRATION_OWED` list is a debt list, not an exemption list: it asserts both directions, so migrating a file and leaving its entry behind fails too. Menus (`UPopover`, `UDropdownMenu`) are a separate vocabulary and deliberately unguarded — they attach to their trigger, carry no title, and commit nothing.

Reach for `app/components/ui/*` and `FieldMenu` before hand-rolling; Nuxt UI v4 is fully MIT, so `UEmpty`, `UUser`, `UAlert`, `UKbd` and the `UDashboard*` family are all available.

## CSS traps

These have no single file to host the comment:

- **`theme()` does not work in scoped CSS** — Tailwind 4 uses `var(--color-*)`.
- **Focus is stated once, in `main.css`, and only on text entry.** An unlayered reset clears every outline — including Nuxt UI's, which it hangs on a `::before` — and one `@layer utilities` rule turns a focused field's `border-color` primary. So **don't write `focus:*` on an element**: give the field an edge to colour (`border`, or a reserved `border-b border-transparent`), or — where it owns no edge — put `focus-within:border-primary` on whatever does: a composite control's shell, or a row-table row (an underline there starts after the label column and floats mid-row). **Focus is never a fill**, which is also why the row-tables draw their own `border-b` per row instead of `divide-y` — a separator drawn as the *next* row's top border is unreachable from the focused row. A `hover:border-*` on a field must be `hover:not-focus-visible:`, or it outranks the focus rule and the field only lights up once the pointer leaves. Two named exceptions carry a meaning rather than a style: `focus:border-error*` on the type-the-name-to-delete confirmations, `focus:border-secondary` on the agent briefing. `outline-none` is never needed and is now a test failure.
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

Before tagging: bump `package.json`, rename `## Unreleased`, update `README.md`. The release workflow pulls the body with `awk "/^## ${TAG}/…"` and **publishes a stub body if no section matches the tag** — verify before pushing. Then `git tag vX.Y.Z && git push origin vX.Y.Z`.

## Where the reasoning lives

Don't reconstruct a decision from scratch, and don't re-litigate one without reading why it was made:

- **A component's own comments** carry the alternatives that were tried and why they failed — `CommentList`, `CardProperties`, `useFileDrop`, `useTagOverflow`, `board-nav` are all substantially prose. A recorded rejection binds only while its mechanism still applies: it is context to argue with, not a veto on the next redesign. A redesign that removes the premise re-opens the option — and owes the prose an update, not obedience.
- **`main.css`** carries every token's measurement.
- **`tests/unit/*.test.ts`** carry the numbers, and the good ones recompute rather than restate.
- **Registries** are single-sourced and guarded: `shared/utils/list-fields.ts` (what a list column can be), `card-fields.ts` (what a board card can show — it stores the fields that are **off**, so a new field appears by default), `ai-skills.ts` (skill scopes).
- `server/assets/openapi.json` must stay in sync with endpoints, for headless API usage only.
- `skills/completo/SKILL.md` is the in-repo copy of the agent skill — update it when CLI commands change.

Docs: [Nuxt](https://nuxt.com/llms.txt) · [Nuxt UI](https://ui.nuxt.com/llms.txt) · [nuxt-auth-utils](https://raw.githubusercontent.com/atinux/nuxt-auth-utils/refs/heads/main/README.md)
