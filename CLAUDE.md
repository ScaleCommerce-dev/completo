# Completo - All the Toppings. None of the Mess.

> **About this file:** CLAUDE.md is for agent guidance - architectural decisions, rules, conventions, and gotchas that can't be inferred from reading code. Don't bloat it with code-level details (file listings, prop docs, full API specs) that agents can discover by reading the source. Focus on the "why", not the "what".

Kanban board app. Nuxt 4 + Nuxt UI 4 + Tailwind 4 + Drizzle ORM + SQLite. Plus Jakarta Sans + JetBrains Mono. Lucide icons (`i-lucide-*`). pnpm.

## ⚠️ Run everything in the zdev container

**This is a zdev-managed project. Every `pnpm`/`node`/`npx` command runs inside the container, never on the host.**

```bash
zdev start                    # boots the env: install → migrate → seed → dev server
zdev exec app <command>       # ← the way you run ANYTHING
```

```bash
zdev exec app pnpm test       # not: pnpm test
zdev exec app pnpm lint
zdev exec app pnpm typecheck
zdev exec app pnpm audit
zdev exec app pnpm install    # after changing package.json
```

Why it matters — these are not stylistic preferences:

- **`node_modules` is in `mutagen.ignore`.** The container has its own dependency tree; the host's is a *separate* copy. A host `pnpm install` does not change what the app runs, and host-only checks (audits, tests, dependency scans) inspect the wrong tree and report misleading results.
- **There is no `.env`.** Dev secrets come from a 1Password Environment injected at container creation, so host-side `pnpm dev` / `pnpm setup` start without `NUXT_SESSION_PASSWORD`, OAuth creds, or AI keys. See the 1Password notes under Local Dev Environment.
- **The database only exists in the container** (`/app/data/sqlite.db`, `data` named volume). Host `pnpm db:*` targets a database the app never reads.
- **Node/pnpm versions are pinned in the image** (Node 24, pnpm 11.17.0). The host may have anything.

**The only things that legitimately run on the host:** `zdev` itself, `git`, and the Go CLI in `cli/` (`go build` / `go test` — the dev image has no Go toolchain). If you genuinely need a host-side `pnpm` command, prefix it with `op run --env-file=...` to get the secrets, and know it operates on the host's separate `node_modules`.

Non-zdev installs (prod, CI) use `pnpm install && pnpm setup && pnpm dev` directly. `pnpm setup` chains migrate → init-admin → seed and reads `ADMIN_USER_EMAIL` / `ADMIN_USER_PASSWORD` (+ optional `ADMIN_USER_NAME`) to create the first admin; skip them and you get an empty install (no users, no demo project). Add an admin later with `pnpm user:create you@example.com password "You" admin`, then `pnpm db:seed` to populate.

## Architecture

### The Core Model

**Statuses and cards belong to projects, not views.** Boards and lists are *views* — they don't own data. Cards have a `projectId` + `statusId`; boards see cards through `boardColumns` (junction table). Removing a column from a board just unlinks it — cards survive. Deleting a status cascades everywhere.

**Don't confuse the two kinds of "column":**

| Concept | What it is | DB table |
|---------|-----------|----------|
| **Board column** | How a status appears on a board (position) | `boardColumns` |
| **Field column** | Which card field shows in a list table | `listColumns` |

### Key Design Decisions

- **Done status & retention:** `doneStatusId` + `doneRetentionDays` on projects. Views **filter out** (not delete) old done cards. Card counts exclude done status. `null` retention = keep forever.
- **Primary keys:** UUIDs everywhere. **Exception:** cards use INTEGER AUTOINCREMENT (for `TK-42` style IDs). Always parse card IDs with `Number()`.
- **Positions:** Integer `position` field. New items = `max(existing) + 1` (not `.length`).
- **Password sentinels:** `'!oauth'` = OAuth-only user, `'!invited'` = admin-created pending setup. Both are unhashable.
- **Synthetic admin role:** API returns `role: 'admin'` for non-member admins viewing projects — don't display it as a real project role.

### Auth & Permissions

- `isAdmin=1` bypasses membership checks via synthetic `{ role: 'owner' }`. My Tasks is NOT admin-elevated.
- **404 not 403** for non-member access (don't leak resource existence).
- **IDOR prevention:** Every card/tag/board endpoint validates resources belong to the correct project.
- **No email in search results** — user search returns name only.
- Domain allowlist restricts self-registration only — invitations and admin-created users bypass it.
- Login requires verified email. `isEmailEnabled()` checks `SMTP_HOST`.
- **One token table, three flows — always scope by `purpose`.** `email_verification_tokens` is shared by email verification, password reset and account setup, so a row is only meaningful together with its `purpose` (`verify` / `reset` / `setup`). `lookupVerificationToken()` takes it as a required argument for that reason; the two consumers that read the table directly (`verify-email.get.ts`, `resend-verification.post.ts`) filter on it inline. Without that filter every consumer accepted any live row, and because reset and verify both *sign the caller in*, an emailed "confirm your address" link could be POSTed to `/auth/reset-password` to take the account over — a forwarded message or a shared team inbox was enough. A new flow writing here owes a new purpose value (plain text, no migration needed) and a consumer that names it. `setup-account` also checks `isPendingSetup()`: a correctly-scoped setup token must still not rewrite a live account's password and display name.
- **Never serve `attachments.mimeType`.** It's whatever the uploading client declared. `server/api/attachments/[id]/download.get.ts` derives the type from the filename via `serveContentType()`, sends `nosniff`, and only uses `Content-Disposition: inline` for `isInlineSafe()` types — images, PDF, plain text. Echoing the stored value inline made every upload stored XSS on the app origin, which an attacker turns into a non-expiring API token via `POST /api/user/tokens`; `HttpOnly` doesn't help, since the attack runs same-origin requests rather than reading the cookie. `isAllowedMimeType()` is *not* the defence and can't be: its `.md`/`.csv`/… patterns match the filename and ignore the declared type entirely.
- **`app/pages/auth/*` pages need an entry in `PUBLIC_ROUTES`** (`shared/utils/auth-routes.ts`). With `ssr: false` the global middleware runs on every navigation and there's no way to opt out from the page, so a missing entry redirects anonymous visitors to `/login` *and* drops any token in the query string — how password recovery came to be unreachable while every server-side test of the same flow passed. `tests/unit/auth-routes.test.ts` enforces the directory↔list correspondence. Keep one-shot emailed links out of `SIGNED_IN_REDIRECT_ROUTES`: bouncing a signed-in visitor discards the token, and `/auth/forgot-password` is the only route back for someone who is still signed in but has forgotten the password `PUT /api/user/password` demands.

### Email Templates (Gotchas)

- Table-based layout only (no flexbox/grid)
- Solid hex colors only (no `rgba()` — breaks in 21% of clients)
- No `border-radius` on buttons (use VML `v:roundrect` for Outlook)

## Conventions

### Do

- **Fetch:** Pages use `useFetch()`, composables use `$fetch()`. Refresh after mutations — **except card mutations**, which patch the local row instead; see the optimistic-mutation notes under Shared components.
- **Composables:** `useKanban()`/`useListView()` accept slug-or-ID + optional `{ projectSlug }` to prevent cross-project slug collisions. Both extend `useViewData()` which holds shared logic (CRUD, tags, members, permissions). Use `useMutation()` for try/catch/toast error handling in composables — don't hand-roll `try { ... } catch { toast.add(...) }`.
- **Shared types:** `app/types/card.ts` defines `BaseCard`, `CardWithStatus`, `Tag`, `Member`, `CardStatus`. Import from `~/types/card` — don't redeclare card interfaces.
- **Transactions:** `db.transaction()` for multi-step DB operations.
- **SSR:** `ssr: false` globally (SPA mode). vuedraggable via `defineAsyncComponent` + `<ClientOnly>`.
- **DB access:** `db` + `schema` auto-imported. `server/utils/` is auto-imported — don't use `~/server/utils/...` (Nuxt 4: `~` = `app/`).
- **Database schema:** `server/database/schema.ts` — all tables, columns, relations. Migrations in `server/database/migrations/`.
- **OpenAPI spec** (`server/assets/openapi.json`, served by `server/api/openapi.get.ts`) must stay in sync with endpoints. Only covers headless API usage — frontend-internal endpoints (slug/key validation, UI column config, notifications, OAuth redirects, registration flows) are intentionally omitted.
- **Server utils:** `enrichCardsWithMetadata()` and `fetchCardMetadata()` in `server/utils/card-metadata.ts` handle bulk tag + attachment count enrichment. Use these instead of inline tag/attachment queries in endpoints.
- **List columns:** every field a list view can show is declared once in `shared/utils/list-fields.ts` — key, label, header label, icon, sortability, width — and the two server allowlists, both sortable-field sets, both column pickers, and the default-column lists all derive from it. It replaced nine hand-maintained arrays that had already drifted twice: `dueDate` was sortable in `ListView` but not on the server (so the header sorted, then failed to save), and `done` was offered in `ViewConfigModal` but not `CreateViewModal`. Adding a field is one entry; `tests/unit/list-fields.test.ts` guards the invariants, and the sortable-fields integration test iterates the set rather than restating it.
  - **`shared/utils/` is auto-imported for Nitro but *not* for app components.** Server code uses these bare (as `server/utils/` does); a `.vue` file must `import { ... } from '#shared/utils/...'` or the identifier is silently undefined and setup dies with a confusing downstream error (`$setup.colWidth is not a function`).
  - **Adding a *new* file under `shared/utils/` needs a dev-server restart** (`zdev exec app zpctl restart app`). The running server's auto-import registry doesn't pick the file up, so server code that is perfectly correct throws a 500 `X is not defined` at runtime. `pnpm test` builds fresh and therefore passes, so the suite is green while the dev server is broken — don't read that as the code being wrong.
  - **Icon names in a `.ts` module aren't found by Nuxt Icon.** `icon.clientBundle.scan` globs templates only, so icons referenced from `shared/utils/*.ts` were dropped from the bundle and rendered as blanks — no error, just missing glyphs. `nuxt.config.ts` extends `globInclude` to cover it; watch the "client bundle consist of N icons" line if you move icon names into plain TS.
- **View components:** `ViewConfigModal` uses a `mode: 'board' | 'list'` prop — don't create separate config modals. `ViewHeader` is the shared header for board/list pages with a `#actions` slot for view-specific buttons.
- **Write tests** for new features. Run `zdev exec app pnpm test` and `zdev exec app pnpm lint` after changes.

### Don't

- **Don't use `theme()` in scoped CSS** — Tailwind v4 uses `var(--color-*)`.
- **Don't use CSS `ring-*` for tag pills** — they use `box-shadow` inset borders.
- **Don't use native `<input type="date">`** — use `UPopover` + `UCalendar` + `CalendarDate`.
- **Don't use `document.createElement('input')` for file pickers** — use a persistent hidden `<input>` ref.
- **Don't use `@keydown` on forms for Cmd+Enter** — portals break it. Use global `document` listener with `capture: true`. Because those listeners are global, a nested editor must be able to claim the shortcut: mark its wrapper `data-comment-editor="new|<id>"` (see `CommentList.vue`) and have the outer handler return early when `e.target.closest('[data-comment-editor]')` matches. Both sides test containment rather than relying on listener order, so neither depends on which component mounted first. Add a new nested editor and it needs the same opt-in, or Cmd+Enter will save the card instead.

- **Don't let a nested editor's `Escape` reach the dialog.** Reka's `DismissableLayer` listens for Esc via VueUse `onKeyStroke` on `window` (bubble phase) and dismisses unless the event was `defaultPrevented` — so an editor that merely emits its own `escape` and lets the event travel on gets the whole card modal closed underneath it, taking an unposted comment or an unsaved description with it. `DescriptionEditor` did exactly that: its `@escape` listeners fired *and* the modal closed. Both Esc branches there now `preventDefault()` + `stopPropagation()` before acting. `preventDefault` alone is what actually stops the dismissal today; the extra `stopPropagation` is insurance against that check changing. Any new nested editor owes the same, and note the corollary — Esc inside a text editor should be a no-op when there's nothing local to dismiss, never a shortcut that discards a draft.

  **A confirmation that renders below the fold reads as a broken app.** `CardModal`'s discard banners sit above the actions, which on a card with comments is far off-screen: the modal simply refused to close with no visible reason. They now scroll into view and focus the safe option ("Keep editing" / "Cancel"), which is also the only way a keyboard user reaches them without tabbing the whole form. Dismissing one restores focus to wherever it was when the guard fired — see the focus-containment note below for why that matters.

  **Containment means focus must stay inside the wrapper**, which is easy to break by accident: any control that takes focus and then unmounts — or a popover that restores focus to a trigger which has since been swapped out — drops focus to `<body>`, and the keystroke silently routes to the card again. The AI review buttons in `DescriptionEditor.vue` did exactly that and cost a written comment. They now carry `@mousedown.prevent` and hand focus back explicitly (to the Keep button while reviewing, since the textarea is hidden behind the preview tab, then to the textarea). Anything new that pulls focus out of a comment editor owes the same treatment.
- **Don't close the browser** during Playwright MCP sessions. Screenshots go in `.playwright/`, clean up after.
- **Don't add Co-Authored-By** lines to commits.
- **Don't commit code review files** (`CODE_REVIEW*.md`) — these are local-only artifacts, gitignored.

### Styling

**Aesthetic:** "Trello meets Linear" — an instrument panel. The chrome is neutral hairlines; the only saturated pixels on screen are the ones carrying data (status dots, tag pills, priority, due-date urgency). The indigo→violet brand gradient appears in exactly three places — the logo, the primary button's pressed depth, and a card mid-drag. Anywhere else it is decoration.

**Never paint a surface with a raw palette utility.** `app/app.config.ts` is the single source of truth for the brand (`primary: indigo`, `secondary: violet` for AI features, `neutral: zinc`), and it reaches markup only through Nuxt UI's semantic tokens:

| Use | Token |
|---|---|
| Page / card background | `bg-default` |
| Recessed surface (column tray, table header) | `bg-muted` |
| Raised surface (hover, chips) | `bg-elevated` · `bg-accented` |
| Body text | `text-default` · `text-toned` |
| Secondary / tertiary text | `text-muted` · `text-dimmed` |
| Headings | `text-highlighted` |
| Hairline / emphasis border | `border-default` · `border-accented` |
| Brand, status | `*-primary` · `*-error` · `*-warning` · `*-success` |

Writing `zinc-500` instead means dark mode has to be maintained by hand and the palette no longer follows the config. The app carried ~1900 such pairs, and because `neutral` was `slate` while templates used `zinc`, dark mode showed a visible navy-vs-charcoal seam between the sidebar and the content. `tests/unit/design-tokens.test.ts` fails on any new raw `zinc`/`slate` surface utility.

**Scales are closed sets.** No arbitrary values.
- **Type** — six steps: `text-2xs` 10 · `text-xs` 12 · `text-sm` 13 (the workhorse) · `text-base` 14 · `text-lg` 16 · `text-xl` 20. `sm`/`base`/`lg` are redefined in `main.css`, so Nuxt UI's internals tighten with our markup. The test rejects any `text-[Npx]`.
- **Radius** — three: `rounded-md` 6 (dense inline controls) · `rounded-lg` 10 (buttons, inputs, cards, popovers) · `rounded-xl` 14 (panels, modals, columns), plus `rounded-full`. Set in Tailwind's `--radius-*`, not `--ui-radius`, because UButton hardcodes `rounded-md` in its own theme.
- **Elevation** — `shadow-raise` · `shadow-float` · `shadow-drag`, indirected through `--elevation-*` so each has a dark-mode value. A plain black-alpha shadow is invisible on a dark surface.
- **Motion** — `transition-colors` by default; `transition` (the default property set) only where opacity or transform actually animates. Never `transition-all`: it animates layout properties too.

**User-chosen colours go through `.swatch`.** Tag, status and project-accent hex is user data that has to work on white and on near-black. Set `--swatch` inline and `.swatch` / `.swatch-dot` / `.swatch-text` / `.swatch-bar` derive a readable foreground, fill and ring per theme via `color-mix()` — no colour-mode logic in JS. Applying the hex raw was the app's worst contrast bug: a dark tag was unreadable in dark mode, and the recipe had been copy-pasted with drifted alphas so the same tag rendered at two tints on two screens.

- **Priority spends colour only where it matters:** urgent → `text-error`, high → `text-warning`, medium and low → neutral, and only urgent/high draw the 2px edge bar (mirrored by `KanbanCard` and `ListView`, so both views describe priority identically). Medium used to be indigo, which on a board where most cards are medium meant the accent carried no information. The medium icon is `equal`, **not** `grip-horizontal` — six dots on a draggable card reads as a drag handle. Charts are the exception and use `priorityChartClass()`, where all four levels must stay distinguishable. Helpers in `app/utils/constants.ts`.
- **Due date:** overdue → `text-error`, due-soon (today/tomorrow) → `text-warning`, future → `text-muted`.
- **Absent data is absent.** An em-dash, not "N/A" / "Unassigned" / "No tags". Ten rows of "Unassigned" down a column is noise about data that isn't there.
- **Ticket IDs:** `{projectKey}-{cardId}`, on the card's identity line beside the tags.
- **Destructive actions:** `<UiConfirmDialog>`, wrapped in `<UTooltip>` where icon-only. Pass `confirmText` for anything that cascades or can't be recovered (projects, views, statuses, users); omit it for cards, comments, attachments and tokens. Never invent a fifth confirmation idiom — there used to be four.
- **Icon-only controls need `aria-label`.** A popover trigger must be a `<button>`, never a `<div @click>`: five inline list editors were unreachable by keyboard because of that. They generally want a `<UTooltip>` too — `aria-label` serves a screen reader, not the sighted user staring at an unlabelled glyph.
- **The app is pointer-first, and that is a decision — not a gap to close and not a licence to strip what is there.** Both halves have nearly been done in a single pass, so the line is worth stating.

  **Don't build keyboard navigation.** No roving `tabindex`, no arrow keys between cards or columns, no focus managers, without a real request behind it. The board is genuinely unusable by Tab today — 91 tab stops, 60 of them per-card controls, 87 to reach the last one, and the card itself isn't focusable — and closing that gap is a feature, not a tidy-up. Keyboard works where it already works: ⌘K search, form fields, the editors, and the menus once open (arrow keys and type-to-jump come free from Reka).

  **Don't remove what costs nothing either.** Semantic `<button>`s, `aria-label`s and `:focus-visible` rings are the framework's defaults or one attribute; deleting them buys no lines worth having and turns "we haven't invested here" into an audit finding, paid for by whoever navigates by keyboard out of necessity. `useMenuFocusReturn` is the one piece of real code in this area, and it exists for the *mouse*: it stops a focus ring appearing round an icon you only clicked, because Escape is itself a keypress and the browser upgrades the restored focus to `:focus-visible`. Its keyboard branch is what keeps that fix from breaking Tab order, and is 14 lines.

  Testing note: **Safari excludes buttons and links from the tab order by default** — Settings → Advanced → "Press Tab to highlight each item on a webpage". "No focus ring anywhere in Safari" is that preference, not a bug here; turn it on before concluding anything from a Safari tab-through.
- **`<UTooltip>` is the tooltip. Native `title=` is not.** The two look nothing alike — the browser's is unstyled, ~1s late, and invisible on touch — and the app had them side by side, sometimes on adjacent buttons in the same toolbar. Native `title` survives in exactly one role: dense, repeated elements where the hint is the element's *own data* rather than authored copy, and a component instance per item isn't worth it — the file name behind a truncated attachment link, the icon name in the 50-cell project-icon grid, the exact timestamp behind a relative one in the admin table. Anything that *explains a control* is a `UTooltip`. Note `title` is also a legitimate **prop** on `UiPage`, `UiModal`, `UiConfirmDialog` and `UEmpty`; those are not tooltips and grep will show them.
- **ESLint:** No comma dangles, 1tbs brace style.

### Shared components

Reach for these before hand-rolling. Nuxt UI v4 is fully MIT and includes the former Pro components, so `UEmpty`, `UUser`, `UAlert`, `UCard`, `UBadge`, `UKbd`, `USkeleton` and the `UDashboard*` family are all available — the app previously reimplemented most of them.

- **`UiPage`** — every page's shell, owning the navbar. Two body contracts: `document` (page scrolls, left-aligned under the navbar title) and `surface` (child owns its scroll, bleeds to the edges). Global chrome — notifications, ⌘K search, the user menu — lives in `layouts/default.vue`, once. Don't hand-build a page header; five idioms used to coexist.
- **`UiModal`** — the dialog shell. Uses UModal's real `#header`, so the dialog has an accessible name. Overriding `#content` discards the panel styling and forces you to rebuild it.
- **`UiConfirmDialog`**, **`UiSaveBar`** (footer order is fixed: destructive far left, primary last), **`UiPerson`**, **`UiSectionLabel`**, **`UiStatusDot`**, **`UiFieldGroup`** / **`UiFieldRow`**.
- **`CardProperties`** — status/assignee/priority/due/tags, shared by `CardModal` and the card detail page so the same fields can't drift into two control vocabularies again.
- **`useTextDraft`** — persists in-progress description and comment text to `localStorage`. Prose is the only thing on those screens with nowhere else to live; persisting it is what lets the unsaved-changes guard stop being a blocking banner.

**Card mutations are optimistic.** `useViewData`'s `updateCard` / `deleteCard` / `updateCardTags` patch the local row, then reconcile with the response, and restore a snapshot on failure. Don't add `refresh()` back: it meant every one-click edit triggered a full view refetch and re-render. Keep nested `status` and `assignee` in step with their ids — the PUT response resolves `assignee` but never `status`.

**`useViewData` must fetch with `deep: true`, and it is not a preference.** Nuxt's `useFetch` defaults to a `shallowRef`, so `data.value.cards[i]` is a *raw* object and patching it in place mutates something Vue never sees. Nothing looks broken in a network log or a database check — the request fires, the object updates — but the board keeps rendering the previous value until an unrelated re-render happens to flush it, which a closing popover or dialog does. That makes the bug intermittent and easy to "verify" as working. It was survivable while every mutation ended in `refresh()`, because replacing `data.value` wholesale is something a shallowRef does notice. `tests/unit/optimistic-reactivity.test.ts` guards it.

**Instant save is split by what a field is, not by which screen it's on.** Status, assignee, priority, due date and tags persist the moment they change — on the board, in the list, in the card modal and on the card detail page alike. Title saves debounced, and flushes on blur, on close and on route leave. Description and comments stay explicit drafts behind Save, which is the only thing that button still does on an existing card. `useCardFieldSync` owns this for both card surfaces.

Its watchers fire on *divergence* from the card rather than behind a "syncing" flag: populating local state sets local == card, so nothing fires, with no dependency on watcher flush order. That also makes a rejected save self-correcting — a revert changes the *card*, which pulls local back through `syncProperties`, and the resulting local change is then equal to the card so no second save is attempted. Title and description are deliberately excluded from that pull; force-syncing them would overwrite text mid-keystroke.

## Testing

**When to run which tests:**
- **App changes** (anything under `app/`, `server/`, `shared/`): `zdev exec app pnpm test` — runs vitest unit + integration tests **in the container**.
- **CLI changes** (anything under `cli/`): `cd cli && go test ./...` — runs Go unit tests. This one runs **on the host**: the dev image has no Go toolchain.
- **Before releasing:** run both.

**App tests:** Two vitest projects: `unit` (fast) + `integration` (sequential, 30s timeout). Test DB on `:43210`. Tests use their own throwaway `test.db` inside the container, so they never touch the dev database.

**CLI tests:** Go unit tests covering semver comparison, env file parsing, config precedence, and output formatting. No HTTP integration tests — the CLI is a thin API client; the API is tested by the vitest integration suite.

### Dependency upgrades: the suite cannot see the client

**The integration tests talk HTTP to a built server and never mount the Vue app.** So a client-side runtime break passes every test. This is not hypothetical: upgrading nuxt 4.4.6 → 4.5.1 split the tree into two Vue copies and the app failed to mount with `Cannot read properties of null (reading 'ce')` — while 481 tests, `lint`, and `typecheck` all stayed green.

Two things guard this, deliberately chosen over adding browser tests to CI:

- **`tests/unit/dependency-singletons.test.ts`** asserts that `vue`, `@vue/runtime-core`, `@vue/runtime-dom`, `@vue/reactivity`, `@vue/server-renderer`, and `vue-router` each resolve to exactly one version in `pnpm-lock.yaml`. Vue keeps module-level state, so two copies break at runtime. Fix a failure with `pnpm update <pkg>` (usually a stale lockfile pin) or a `pnpm.overrides` entry. `@vue/compiler-*` and `@vue/shared` are excluded on purpose — build-time only, and `vue-tsc` legitimately pins an older compiler.
- **After any framework-level bump (nuxt, @nuxt/ui, vue, vite), actually load the app in a browser** and check the console. There are no automated browser tests: `createPage()` would need Playwright plus the `chromium` apk in the dev image (~300 MB), which wasn't judged worth it because this check happens during agent-assisted development anyway. Don't assume green tests mean the UI renders.

`@nuxt/test-utils` was removed — it was an unused devDependency (the e2e harness here is hand-rolled in `global-setup.ts` + `tests/setup/`, one build and one shared server for all files, which is faster) and it declares `vue` as a hard dependency rather than a peer, which is what pinned the second Vue copy. If browser tests are ever wanted, it can come back in host mode (`setup({ host })` skips its own build and server, so the single-server model survives).

**Gotchas:**
- `fetch(url('/path'))` for raw responses (ofetch throws on non-2xx)
- `randomKey()` in fixtures to avoid 409 conflicts
- `process.env.NODE_ENV` inlined at build — use custom env vars for runtime gating
- **Stale test servers are cleaned up automatically** by `tests/global-setup.ts`, which finds the previous `.output/server/index.mjs` via `/proc` and kills only that. Don't "fix" it with `lsof -ti:PORT | xargs kill -9` — that was the original code and it took the container down: Alpine's `lsof` is a BusyBox symlink that ignores `-t`/`-i` and prints every open file, so `xargs kill -9` killed PID 1 and the vitest process (SIGKILL, exit 137). BusyBox `fuser` is no substitute either — it resolves no owner for a listening TCP port in this image.

## Environment & Commands

`NUXT_SESSION_PASSWORD` is the only required env var (min 32 chars). See `env.sample` for the rest. Key vars: `DATABASE_URL` (default `sqlite.db`), `AI_PROVIDER` (`anthropic`/`openai`/`openrouter`, empty=disabled), `SMTP_HOST` (empty=email disabled), `UPLOAD_DIR` (default `data/uploads`), `NUXT_OAUTH_*_CLIENT_ID/SECRET` (empty=provider disabled).

In dev these run **in the container** — prefix each with `zdev exec app` (several have a shorter `zdev` alias, see Local Dev Environment). The bare forms below are what prod/CI run.

```bash
zdev exec app pnpm build / test / lint / typecheck    # `pnpm dev` is already supervised by zpinit
zdev exec app pnpm db:migrate / db:init-admin / db:seed / db:cleanup   # or: zdev migrate | seed | cleanup
zdev exec app pnpm user:create <email> <password> [name] [admin]
zdev exec app pnpm user:set-role <email> <admin|user>
zdev exec app pnpm user:verify-email <email>
zdev migrate generate                                # drizzle-kit generate — then COMMIT the .sql + meta/
zdev exec app pnpm setup                             # migrate + init-admin + seed (non-zdev bootstrap only)
```

### Local Dev Environment (zdev)

`.zdev/` defines the containerized dev env (was `.scdev/`). `zdev start` serves the app at `https://completo.0ploy.dev`.

**Two Docker setups, deliberately different — don't unify them:**

| | `docker/Dockerfile` (prod) | `.zdev/Dockerfile` (dev) |
|---|---|---|
| Purpose | Released image, built in CI | Local dev container |
| Runtime base | `alpine:3.24` + `apk add nodejs` (~109MB) | `node:24-alpine` (~229MB) |
| zpinit mode | 3 — supervise (`node .output/…`) | 3 — supervise (`pnpm dev`) |
| Admin user | From `ADMIN_USER_*` env vars | Hardcoded dev credentials |

Prod optimizes for size and drops npm/corepack it never uses; dev needs corepack (pnpm) and `python3/g++/make` (better-sqlite3 has no musl prebuild). Node 24 LTS + pnpm 11.17.0 in both — bump `packageManager` in `package.json` and both Dockerfiles together.

**Scripts run as `node scripts/foo.ts` — no tsx, no package manager.** Node strips TypeScript natively (default since 22.18; `process.features.typescript === 'strip'`), so the same command works in dev, in prod, and on the host. This is deliberate: the prod runtime image has neither npm nor pnpm, so anything invoking a package manager could not be shared between the two. Two constraints follow:
- `engines.node >= 22.18` in `package.json`. Type stripping is erasable-syntax-only, so **no `enum`, `namespace`, parameter properties, or decorators in `scripts/*.ts`**, and relative imports would need explicit `.ts` extensions (currently there are none).
- `scripts/package.json` still vendors `better-sqlite3`/`dotenv`/`drizzle-orm` into `scripts/node_modules` for the prod image (installed with npm — it has its own `package-lock.json`). It no longer carries `tsx`.

`node:sqlite` would let us drop `better-sqlite3` (and with it the native toolchain and the builder↔runtime ABI constraint), but `drizzle-orm/node-sqlite` only exists in drizzle-orm v1 beta. Revisit when v1 is stable.

```bash
zdev start / stop / restart / logs -f app
zdev update              # apply config.yaml changes (restart alone does NOT)
zdev exec app pnpm test  # run any command in the container
zdev info                # shows the dev logins
zdev mail                # Mailpit — catches all outgoing mail
zdev migrate             # apply migrations; also: generate | push | seed | cleanup
```

- **Dev logins are seeded on every boot** and printed by `zdev info`: `admin@completo.local / admin1234` (admin) and `demo@completo.local / demo1234`. Defined once in `.zdev/config.yaml` `variables:` and referenced from both `environment:` and `info:`. Dev-only — prod still provisions from `ADMIN_USER_*`.
- **Boot order** is `.zdev/zpinit/entrypoint.d/`: `10-install` (waits for the `/.zdev-sync-ready` marker, then `pnpm install`) → `20-migrate` → `30-seed`, then zpinit supervises `pnpm dev` from `.zdev/zpinit/services/10_app.toml`.
- **The dev container is built not to die.** zpinit stays PID 1 (supervise mode) and `entrypoint_on_failure = "continue"`, so a crashed dev server *or* a failed `pnpm install` leaves a live container with the error in `zdev logs` — always something to `zdev exec app sh` into. After 5 consecutive crashes the service goes FATAL and zpinit stops retrying, still holding the container open. Drive it with `zdev exec app zpctl status` / `zpctl restart app` / `zpctl tail -f app`.
- **`.zdev/config.yaml` must not set `command:`** — zdev turns that into the container CMD, which flips zpinit out of supervise mode into exec mode.
- **Editing `entrypoint.d/` needs a rebuild.** `.zdev` is excluded from the file sync, so `/etc/zpinit` is the image's copy. `zdev update` rebuilds on *Dockerfile content* changes only — touch `.zdev/Dockerfile` after editing an entrypoint script.
- **The container's DB is `/app/data/sqlite.db` in the `data` named volume, and it is the only dev database.** It's out of the file sync deliberately (SQLite WAL over Mutagen risks corruption), and no host-side `sqlite.db` shadows it — `*.db*` is in `mutagen.ignore` so a stray one can't sync in and look authoritative.

  Dev data is **disposable by design**: `zdev down -v -f` destroys the volume and the next `zdev start` rebuilds it from migrations + seed, back to the demo board and the two fixed logins. Nothing else holds a copy, so that command means what it says. Tests are unaffected (they use their own throwaway `test.db`).

  **So change it freely while testing.** Creating cards, moving them between columns, toggling tags, renaming a board — none of it needs undoing afterwards, and carefully restoring the previous state costs more than it is worth. Clicking through a change in the browser is how you verify it; treat the demo board as a scratchpad. (This is dev only. Nothing here licenses touching a real database.)

  Historical trap, in case old notes say otherwise: before `DATABASE_URL` was set here, the app fell back to the relative default `'sqlite.db'`, which resolved against `/app` — the bind-mounted project dir — so the container silently shared the *host's* DB. That's why a container could appear to "lose" data when the setting was introduced.
- Boot applies committed migrations (`node scripts/db-migrate.ts`). For a schema change: `zdev migrate generate`, commit it, restart. There is no `zdev migrate push` — see Schema Changes & Migrations for why.
- **`.zdev/commands/migrate.just` → `zdev migrate`** is only an alias for those same `node scripts/*.ts` commands, so dev and prod stay verifiably identical. Adding a `.just` file there adds a `zdev <name>` subcommand.
- **Email is wired to the shared Mailpit** (`SMTP_HOST: mail`). Because `isEmailEnabled()` keys off `SMTP_HOST`, logins require a verified email — the seeded users are auto-verified; check other mail via `zdev mail`.
- **There is no `.env` file.** Dev secrets (`NUXT_SESSION_PASSWORD`, the OAuth client IDs/secrets, AI keys) live in a 1Password Environment, attached via `op-env: ${op-env}` on the app service. The Environment **ID** in `.zdev/config.yaml` is not secret and commits safely; values are fetched by the `op` CLI only when a container is created. Needs the beta CLI (`brew install 1password-cli@beta`) with the desktop-app integration enabled.
  - After rotating or adding variables in 1Password: **`zdev update --refresh-secrets`**. Plain `zdev restart`/`zdev update` will *not* pick them up — the env is baked into the container at creation. The refresh compares a `zdev.secrets-hash` label and only recreates services whose injected set actually changed, so it's cheap to run habitually.
  - Non-secret, dev-specific values (`SMTP_HOST: mail`, `APP_URL`, `DATABASE_URL`, the dev logins) stay as explicit `environment:` entries — those always win over injected variables, which is what keeps prod-shaped values in 1Password from leaking into dev.
  - Host-side `pnpm dev` / `pnpm setup` no longer get these vars automatically. Prefix with `op run --env-file=...` or export them manually if you need to run outside the container.
- Per-developer overrides go in `.zdev/local/config.yaml` (gitignored, deep-merged). Don't put secrets in `.zdev/config.yaml` — use the 1Password Environment.
- `zdev restart` does not pick up `config.yaml` edits — use `zdev update`. Source changes are live via the file sync.

### Changelog

`CHANGELOG.md` uses `## vX.Y.Z` sections (latest on top) with `### App`, `### CLI` and — where a release needs them — `### Upgrading` (anything an operator must do *before* deploying) and `### Dev` (migrations, security internals, invariants a contributor has to know). When making changes, add entries under `## Unreleased` at the top. If no `## Unreleased` section exists, create one. Use concise, user-facing language (not commit messages). At release time, rename `## Unreleased` to `## vX.Y.Z` with the date — and **don't** add an empty `## Unreleased` back. A heading with nothing under it reads as "a release is pending" to anyone landing on the file, which is the opposite of what it means; the next change to land creates the section, as above. (Both v0.7.0 and v0.8.0 shipped with that empty heading at the top of `main` because this used to say otherwise.)

**Not every change earns an entry, and a commit is not the unit.** `### App` is read by people *using* Completo, so the test is whether someone who never sees the repository would notice: a new capability, changed behaviour, or a bug they could have hit in a version they actually ran. Refactors, renames, consolidations, test and doc changes and dependency bumps are not entries however much work they were — if a contributor needs to know, that is what `### Dev` is for, and most of the time nobody does. Three failure modes to watch, all of which the UI overhaul produced:

- **A bug introduced and fixed between two releases never happened.** Nobody outside the branch could have met it, so "Fixed: …" is telling users about a stumble in the workshop. Delete the note along with the bug.
- **One user-visible change is one entry, however many commits it took.** Three separate bullets saying tag colours became readable — in the picker, in the tag manager, on a card — read as three changes to a user who experienced one.
- **"We unified six implementations" is not a user-facing sentence.** Say what they now see (every menu names its field, marks the selection the same way), not how many there used to be. The reasoning that justified the work to us is rarely what a user needs; that belongs in the commit message, where it is preserved anyway.

A release with two dozen entries is fine when two dozen things changed for users. A release with two dozen entries because twenty-seven commits landed is not.

### Releasing

**Before tagging a release:** bump `version` in `package.json`, rename `## Unreleased` to `## vX.Y.Z` in `CHANGELOG.md`, update `README.md` with any user-facing changes, and commit those changes.

The rename is what produces the release notes, and skipping it fails quietly: `release-build.yml` pulls the body with `awk "/^## ${TAG}/…"`, so with no section matching the tag it falls back to a body of just `Release vX.Y.Z` and publishes anyway. Check with `awk "/^## v0.8.0/{f=1;next} /^## v/{if(f)exit} f" CHANGELOG.md` before tagging. Anything above the newest version heading — an in-progress `## Unreleased` — is never picked up, so it can't leak into a release.

**To release:** `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag push triggers two workflows:
- **CI** (`ci.yml`) — runs lint + tests against the tag.
- **Release** (`release-build.yml`) — builds multi-arch Docker image, cross-compiles Go CLI binaries (5 targets), pushes Docker to GHCR (`ghcr.io/scalecommerce-dev/completo`), and creates a GitHub Release with changelog notes and CLI binaries attached.

**To re-tag** (e.g. after a fix): delete the GitHub release (`gh release delete vX.Y.Z --yes`), delete remote + local tag (`git push origin --delete vX.Y.Z && git tag -d vX.Y.Z`), then re-tag and push.

### CLI (`cli/`)

Go CLI for interacting with Completo from the terminal or AI agents. Uses Cobra. Config: `~/.completo/.env` (credentials) + `.completo` (project-scoped). Build: `cd cli && go build -o completo .`

**Local dev override:** Create a `.completo.local` file (gitignored) alongside `.completo` to point the CLI at the local dev server instead of production. Config precedence: `~/.completo/.env` → `.completo` → `.completo.local` → `--env-file` → env vars.

```env
# .completo.local
COMPLETO_URL=http://localhost:3000
COMPLETO_TOKEN=<dev-api-token>
```

Alternatively, use `--env-file path/to/env` for one-off overrides (e.g. CI, testing a built binary from a different directory).

### Agent Skill (`skills/completo/SKILL.md`)

The Completo agent skill lives in-repo at `skills/completo/SKILL.md` — this is the local development copy, not the installed one. When CLI commands change, update this file to keep the skill in sync. Use the `/skill-creator` skill to help with updates.

### Completo Briefing

`Completo-Briefing.md` provides project context to Completo's AI features (card description generation). Update it when the domain model, architecture, or conventions change significantly. Use the `/completo-briefing` skill to regenerate it, then upload via `completo briefing --file Completo-Briefing.md`.

### Schema Changes & Migrations

**Every schema change requires a committed migration. No exceptions.**

1. Edit `server/database/schema.ts`
2. `zdev migrate generate` (drizzle-kit runs in the container — a host `npx drizzle-kit` would read the host's separate deps and no dev database)
3. **Commit both** the new `server/database/migrations/*.sql` *and* the `meta/` changes — `meta/_journal.json` is what the migrator reads; a `.sql` file without its journal entry is invisible and silently never runs
4. Apply with `zdev migrate` (or just restart the dev container — it migrates on every boot)

`pnpm db:migrate` is the only thing that touches a real database: dev container boot, the prod entrypoint, and deploys all run it. Skip steps 2–3 and the change exists only on your machine — CI, the prod image, and every teammate diverge, and the deploy fails on the first query against the missing column.

**Product defaults ship via a migration; the seed is only demo content.** `db:migrate` is the only step guaranteed to run exactly once on every install, so anything that must exist everywhere (the default AI skills, for instance) belongs in a data migration — `0003_default_comment_skills.sql` is the worked example, hand-written since drizzle-kit only generates DDL. It needs its own `meta/_journal.json` entry plus a `meta/NNNN_snapshot.json` copied from the previous one with a fresh `id` and `prevId` chained, or `drizzle-kit generate` loses its diff base. Anything added to `scripts/db-seed.ts` reaches **fresh installs only**. Guard seed inserts per row (by name), never with "does this table have any rows" — that older guard meant a new default was skipped forever on any install that already had one, and it silently skipped the card skills once migration 0003 populated the table.

**AI skill scopes** (`card` / `board` / `comment`) decide which editor offers a skill. The list lives once in `shared/utils/ai-skills.ts` — it was previously duplicated across the public endpoint and both admin write endpoints, which is how it came to be missing a value in some. The column is plain text with no CHECK constraint, so adding a scope needs no migration, but every validator must know about it.

**Never run `drizzle-kit push` against a database you keep.** It applies the schema without recording a migration, which permanently poisons that DB: `db:migrate` afterwards either restarts at `0000` and dies on `table already exists`, or — if you later generate the matching migration — dies on `duplicate column name`. Both are verified. `pnpm setup` breaks too, since it chains migrate first. The only fix is to discard the database (`zdev down -v -f && zdev start` for the dev container; its SQLite is a named volume and boot re-migrates and re-seeds). If it holds data worth saving, the `__drizzle_migrations` journal can be backfilled by hand — ask before attempting it.

**`scripts/package.json`** is a deploy manifest for CLI tools. When changing imports in scripts, update it to keep deps in sync.

## Documentation

- Nuxt: https://nuxt.com/llms.txt
- Nuxt UI: https://ui.nuxt.com/llms.txt
- Nuxt Auth Utils: https://raw.githubusercontent.com/atinux/nuxt-auth-utils/refs/heads/main/README.md
