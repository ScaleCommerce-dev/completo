# Changelog

## Unreleased

### App
- **A board card reads as a title now.** The first thing on every card used to be its ticket number, with the title on line two and the first two lines of the description underneath — so a card carrying a spec rendered as a paragraph, and a column of twenty read as a wall of identifiers. Titles come first, the description is off the card face (a small glyph says one exists), tags are a coloured dot and a name instead of a filled uppercase pill, and the ticket ID has moved to a quiet footer line where it is still one click to copy. Cards are shorter as a result.
- **List views open on the title, not the ID.** New lists and My Tasks put Title first and the ticket ID last. Existing lists keep the column order you gave them.
- **Fixed: list views could render every title blank.** With enough columns showing, the fixed-width ones took all the space and the Title column collapsed to a few pixels — its header overlapping its neighbour and not one row showing a title. It degraded with the width of your window, so it looked fine on a large screen. Title now has a floor and the table scrolls sideways instead.
- **Lists stop repeating things that aren't there.** Every row used to say "Medium" and show an em-dash in each unset column. Priority only shows when it is High or Urgent, and empty cells stay blank until you hover the row — the field is still there to click.
- **Cards open in a side panel.** Clicking a card slides a panel in from the right instead of covering the board with a centred dialog, so you can still see where the card sits. It runs the full height of the window, Save and Delete are pinned at the bottom where they can no longer scroll out of sight, and the five property rows are now one line of chips — the description and the comments are visible the moment the panel opens. On a new card, typing a title and pressing Enter creates it.
- **Fixed: every unknown URL said "Card not found."** A mistyped project link, a deleted board and `/nonsense` all claimed a card was missing. The message now names what was actually not found.
- **Project cards say what they are counting.** "12  1  6" behind four icons is now "12 cards · 6 people · 7m ago", and a project without a description no longer displays the words "No description". The project key is quiet metadata beside the name instead of a coloured chip competing with it.
- **Tags are no longer forced into capitals.** A tag you named "ux/ui" displayed as "UX/UI" everywhere, including in the field where you rename it. The project's tag manager also had the dark-mode contrast bug that was fixed elsewhere — a dark tag colour was unreadable there.
- **My Tasks explains why it is empty.** It only lists cards from projects you belong to, which is not obvious if you are an administrator who can see every project.
- **Delete in view settings is back on the far left,** away from Save, matching every other dialog in the app.
- **View settings is two tabs instead of one long scroll.** Columns and filters were stacked in a single column, so reordering a board meant scrolling past the filter section and setting a filter meant scrolling past the columns. Each tab shows a count — how many columns the view has, and how many filters are active, which previously you could only find out by scrolling to the bottom of the dialog. Tag filtering is a searchable list rather than a chip for every tag in the project; thirteen already wrapped onto three lines.
- **User management is a table.** Eighteen near-identical cards in a three-across grid meant reading all of them to find the one suspended account. Name, email, role, status and last seen are now columns, so each fact is in the same place on every row, and only the exceptions are marked — admins and anything wrong with an account. Suspended rows keep their red tint, and actions moved to a row menu: the only way to suspend someone used to be clicking the word "User". Pending project invitations became a table on the same page.
- **The whole interface has been rebuilt on one design system.** The app was shipping two brand colours and two greys at the same time: buttons, dropdowns and the date picker rendered blue-on-slate while every hand-written accent was indigo-on-zinc, which in dark mode showed as a visible navy-against-charcoal seam between the sidebar and the content. Colours, type sizes, corner radii and shadows now come from one place, so light and dark stay in step and nothing has to be maintained twice.
- **Tag colours are readable in dark mode.** A dark tag colour used to sit on a faint wash of itself and effectively disappear. Tag, status and project colours are now adjusted for whichever theme you are in, and the same tag looks the same everywhere — it used to render at two different tints depending on the screen.
- **The board is denser and quieter.** Cards fit their content instead of always reserving a footer row, the ticket ID and tags share a line, and long titles no longer run on. Priority is a thin coloured edge — the same way the list view has always shown it — and only High and Urgent get one, so an urgent card actually stands out. The "N/A" badge on unassigned cards is gone, and assignees show their picture rather than initials.
- **You can add a card by typing.** "New card" opens a box in the column instead of the full card dialog, and stays open so you can type a backlog in one go. Columns also have their own menu now, so renaming, recolouring or removing one no longer means opening view settings.
- **Dragging a card shows where it will land.** The target column lights up, empty columns offer a proper drop area, and the board fades at the edges when there are more columns off-screen.
- **Editing a card field is instant, everywhere.** Changing a priority, status, assignee, due date or tag used to reload the entire board or list and re-animate every row. It now updates immediately, and reverts with an explanation if the server refuses.
- **The card dialog and card page no longer make you press Save for properties.** The board and lists have always saved a status or assignee on the click, while the same fields behind the card dialog waited for a Save button — so the rules changed depending on which screen you were on. Status, assignee, priority, due date and tags now save as you set them, the title saves as you finish typing it, and Save is left doing the one thing it was actually needed for: committing a description you have written. That also means leaving a card no longer warns you about a status change the server already accepted.
- **Boards and lists show a loading placeholder** instead of appearing empty until data arrives.
- **Press `⌘K` (or `Ctrl+K`) to search.** Jump to any project or run a command without reaching for the sidebar. The sidebar itself now groups projects and admin pages under headings, can be resized, and keeps the theme switch reachable when collapsed.
- **Every page has a consistent header** with its title, its actions and the notification bell in the same place, and browser tabs finally show which page you are on.
- **The card detail page and the card dialog now show the same controls** for status, assignee, priority, due date and tags. The created and updated timestamps are labelled — previously they were two unlabelled dates stacked on each other — and attachments no longer take a block of space when a card has none, which used to push the comments off-screen.
- **Descriptions and comments you have typed are kept.** In-progress text is saved locally as you write, so closing a card by accident no longer loses it.
- **Empty screens explain what goes there** and offer the action that fills them, instead of the five different treatments they had before.
- **Fixed: the "Fields" button on My Tasks did nothing.** It opened a dialog that did not exist. It now opens the column picker.
- **Fixed: uploaded profile pictures never appeared.** Avatars fell back to initials everywhere — the sidebar, list views, member lists — even for people who had one.
- **Fixed: the list view was clipped at both edges**, with the ID column hidden behind the sidebar divider and the assignee column running off the right.
- **Fixed: the theme switch disappeared when the sidebar was collapsed**, leaving no way to change theme.
- **Accessibility:** icon-only buttons, columns and inline editors now have names screen readers can read; sortable table headers and the status, priority, assignee, tag and due-date editors in list views are reachable and operable by keyboard; dialogs announce their titles; and every animation respects "reduce motion".

## v0.8.0 (2026-08-12)

### Upgrading

Two things to check before you deploy this one. Everything else is a straight upgrade.

- **Serving Completo over plain HTTP from an address other than `localhost`?** Set `NUXT_SESSION_COOKIE_SECURE=false`, or nobody will be able to sign in: the session cookie is now marked `Secure`, and browsers silently discard those on an insecure origin. `localhost` needs no change, and neither does HTTPS terminated at a reverse proxy — which covers most installs.
- **Migration `0004` stops the deploy if two accounts differ only in the capitalisation of their email.** It lowercases every address and adds a case-insensitive unique index, so a genuine pair — `foo@example.com` and `Foo@example.com` — has to be resolved by hand first, since only you can decide which identity keeps its cards and memberships. Check with `SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*) > 1`. No rows means nothing to do.

API clients: `mimeType` on an attachment is now derived from the file extension rather than echoing the uploader's declared type, and attachment downloads send `Content-Disposition: attachment` for everything except images, PDF and plain text.

### App
- **Cards now show who created them.** The card detail page has a "Created by" line next to the timestamps, the card modal credits the author next to the ticket ID, and list views (including My Tasks) can show a **Creator** column, sortable like Assignee. Creator is set once when the card is created and can't be changed. Cards whose creator has since been deleted show "Unknown". Existing cards already show the right person — the creator has been recorded since the first release, just never displayed, so no backfill is needed.
- **Fixed: sorting a list by Due Date wouldn't stick.** Clicking the Due Date header sorted the rows and then failed with "Invalid sort field" — the column was sortable in the table but the server refused to remember it, so the order reset on reload. Due Date now saves like every other sortable column.
- **Fixed: the Done checkbox column couldn't be picked when creating a list.** It was offered in a list's settings but missing from the create-view step, so you had to make the list first and add the column afterwards. Both pickers now offer the same set of columns.
- **Fixed: pressing `Esc` in a card editor closed the whole card and threw away what you'd typed.** It affected the comment box, a comment you were editing, and the card description — the keystroke was meant to be handled locally (cancel the edit, close the description editor) and it was, but it also travelled on and dismissed the card modal behind it. `Esc` now stops at the editor it was pressed in: it dismisses the `@mention` list if one is open, otherwise cancels a comment edit or closes the description editor, and does nothing at all when you're partway through a new comment. Closing the card another way — clicking outside, or the close button — now asks first when an editor is holding text, naming what's at risk, and hands focus back to where you left off if you choose to keep editing.
- **Fixed: using an AI skill on a comment, then pressing `Cmd+Enter`, closed the card and threw the comment away.** The shortcut is routed by which editor has focus, and the AI round-trip lost it: the skill menu took focus, then closed onto a button that had meanwhile been replaced by "Stop", leaving focus nowhere — so `Cmd+Enter` fell through to the card modal, which saved the card, closed, and took the unposted comment with it. Focus now stays inside the editor throughout: on the "Keep" button while you review the suggestion, and back in the text box once you keep or discard it. `Cmd+Enter` straight from the review state posts the comment as it stands.
- **Fixed: the icon list in project settings couldn't be scrolled, and opening it put Save out of reach.** Typing in the icon search matches against all ~1,770 Lucide names, so the grid grew to well over a hundred rows. In the edit dialog that pushed the bottom of the form — Key, Slug, Done status, and the Save, Cancel and Delete buttons — past the dialog's edge with nothing to scroll, so the only way out was to close the picker again. The icon grid now scrolls inside a fixed height, and the project form scrolls whenever it outgrows the dialog.

- **Fixed: an invited user who signed up on the register page instead of using their invitation link was left stranded.** For someone an admin had created an account for, registering returned "Account created. Please check your email" and then did nothing at all — no account, no email, and no way in, since their password had never been set. Registering with that address now re-sends their setup link instead. The response is deliberately unchanged, so it still reveals nothing about whether an address already has an account.
- **Fixed: signing in and signing up now ignore capitalisation in email addresses.** `Someone@example.com` and `someone@example.com` were treated as two different people: registering the second form when the first already existed created a *second* account, and each could then only be reached by typing that exact capitalisation. Password reset always lowercased, so a mixed-case account could never reset its password either. Addresses are now stored lowercased, matched case-insensitively everywhere, and the database enforces it.
- **Fixed: being invited and then signing in with Google, GitHub or Microsoft left the account marked "pending setup" forever.** The sign-in worked and the person could use Completo normally, but user management still listed them as never having set up, and password reset stayed blocked for them. Claiming an invitation through a social provider now completes the account.
- **The "restricted to approved email domains" message now tells invited people what to do.** Someone invited from a domain that isn't on the allowlist hits the same wall as an uninvited stranger, with no hint that their invitation email is the way in. The message now says so — to everyone who sees it, since wording it based on whether that address has an invitation would let anyone probe who has been invited.
- **Fixed: password recovery couldn't be completed in the browser.** "Forgot password?" and every emailed reset link redirected to the sign-in page — and the link's token was discarded on the way — so anyone locked out stayed locked out. Both pages were missing from the list of routes that load without a session. They also stay reachable while signed in, which is the only way back for someone who is still logged in somewhere but has forgotten the password they'd need to change it.
- **Security: an emailed link can no longer be redeemed for something it wasn't issued for.** Verification, password-reset and account-setup links all drew on one pool of tokens, and each page accepted any of them — so a "confirm your email address" link could be used to set a new password on that account, and the reply signed the sender straight in. Anyone who saw one such message (a forwarded mail, a shared or team inbox) could take the account over without knowing its password. Each link is now valid only for the flow that sent it. Setup links additionally refuse accounts that have already been set up, where they could previously overwrite a live user's password and display name.
- **Security: an uploaded file can no longer run as part of Completo.** Downloads echoed back the content type the uploading browser claimed, and showed the file inline, so a project member could upload an HTML file — or an SVG, or any name ending in `.md` while declaring itself HTML — and anyone who opened it ran the uploader's script inside the app, with that person's access to every project they can see. Downloads now determine the type from the file's extension, and only show images, PDFs and plain text inline; anything else downloads. Image previews on cards are unaffected.
- **Security: the session cookie is now marked `Secure`.** It was explicitly configured not to be, overriding a safe framework default, so every HTTPS install sent its session cookie over any plain-HTTP request that reached the same host — a stray `http://` link, a misconfigured proxy or a redirect was enough to leak it. If you reach Completo over plain HTTP from anything other than `localhost` — a home server at `http://192.168.1.50:3000`, say — set `NUXT_SESSION_COOKIE_SECURE=false`, or signing in will appear to work and drop you back at the login page. `localhost` needs no change (browsers treat it as a secure origin), and neither does TLS terminated at a reverse proxy. Existing sessions stay valid.
- **Fixed: adding a member by email failed on capitalisation.** Typing `Someone@Example.com` for an existing user created a pending invitation instead of adding them — and that invitation could never be accepted, because invitations are only picked up while registering. The address is now matched regardless of case or surrounding spaces.

### Dev
- **Migration `0004` lowercases existing email addresses and adds a case-insensitive unique index** (`users_email_lower_unique`). `users.email` was `UNIQUE` without `COLLATE NOCASE`, so normalising in code alone would leave the next endpoint free to reintroduce the split. The `UPDATE` runs against the old case-sensitive constraint on purpose: on an install that already holds both `foo@x` and `Foo@x`, it collides and the migration aborts rather than silently merging two identities — check with `SELECT lower(email), count(*) FROM users GROUP BY lower(email) HAVING count(*) > 1` and resolve those rows first.
- **Migration `0005` clears the stale "pending setup" badge from accounts that are already in use.** An invited account that was claimed through a social provider (or used via an API token) kept `!invited` and an unverified email, so user management listed active people as never having set up and `forgot-password` refused to help them. Rows carrying a `last_seen_at` are marked `!oauth` and dated from that sign-in; rows genuinely still awaiting setup are untouched. The code path that caused it is fixed too, so this is a one-off repair.
- **Issuing an account-setup link is now one helper**, `sendAccountSetupLink()` in `server/utils/account-setup.ts`, shared by admin user creation, the admin resend action, and the register path. It was duplicated token-for-token across the first two, which is why the third could not simply reuse it.
- **Migration `0006` adds `purpose` to `email_verification_tokens`** (`verify` / `reset` / `setup`), and `lookupVerificationToken()` now requires the caller to name the purpose it will accept. Hand-written: drizzle-kit emitted `ALTER TABLE ... ADD purpose text NOT NULL`, which SQLite rejects outright on a table holding any row, so this rebuilds the table instead — landing on exactly the shape the snapshot declares, rather than leaving behind a column default the snapshot doesn't describe. Existing rows are labelled by inference, which is sound because the three writers have mutually exclusive preconditions and each clears the user's other tokens first.
- **The public route list moved to `shared/utils/auth-routes.ts`** so it can be unit-tested; `auth.global.ts` can't be imported from a test because it calls `defineNuxtRouteMiddleware`. `tests/unit/auth-routes.test.ts` asserts that every page under `app/pages/auth/` appears in `PUBLIC_ROUTES` — the invariant that the recovery-page bug violated for as long as it existed, invisible to a suite that never mounts the client.
- **Attachment serving no longer trusts `attachments.mimeType`.** `serveContentType()` and `isInlineSafe()` in `server/utils/storage.ts` derive the response type from the filename, and uploads now store that derived value rather than the client's claim — leaving the raw claim in the database would keep a value there that is unsafe to echo, ready for the next endpoint to reach for. Note the upload allowlist can't be the defence here and isn't: its extension patterns match on filename alone and never inspect the declared type.
- **List column fields now live in one place**, `shared/utils/list-fields.ts`. They were spread across nine hardcoded arrays that never referenced each other — two server allowlists, two sortable-field sets, two picker option lists and three default-column lists — so adding a field meant six hand edits with nothing to catch a miss. Both bugs above were that drift. The pickers, validators, header labels and column widths now derive from a single declaration, `tests/unit/list-fields.test.ts` guards its invariants, and the sortable-fields integration test iterates the set instead of restating it (it had itself fallen two fields behind). Also closes a gap where `POST /api/projects/:id/lists` inserted `columns` unvalidated while the add-column endpoint checked the same input.
- **`nuxt.config.ts` now scans `shared/utils/*.ts` for icon names.** `icon.clientBundle.scan` globs templates only, so moving icon names into a `.ts` module dropped three from the bundle and they rendered as blanks — silently, since a missing icon isn't an error.

## v0.7.0 (2026-08-12)

### App
- **Comments on cards.** Every card now has a comment thread below the description, on both the card detail page and the board's card modal. Comments support markdown and `@mentions` using the same editor as descriptions. Mentioned project members get an in-app notification, and the card's assignee is notified of new comments — never for their own. You can edit and delete your own comments; edited ones are marked as such. Editing only notifies people newly mentioned, so fixing a typo doesn't ping everyone again.
- **AI assistance for comments.** The comment editor now offers its own AI skills instead of the card-description ones, which made no sense there. Two ship by default: **Fix Spelling & Grammar**, which corrects mistakes without rephrasing anything, and **Improve Clarity**, which rewrites for readability using the card and the previous comments as context. Both preserve `@mentions` exactly, so improving a comment never breaks a notification. Admins can add their own comment skills under AI Skills. Requires `AI_PROVIDER` to be configured; with it unset the AI button stays hidden as before.
- **`Cmd+Enter` now follows what you're editing.** It used to always save the card. Pressed inside the comment box it posts the comment, inside a comment you're editing it saves that comment, and anywhere else on the card it still saves the card.
- **Fixed: `@mentions` could notify the wrong person.** Mentions were matched by display name, which isn't unique, so with two similarly named members an arbitrary one was picked — and renaming a user broke their mentions. Mentions now carry the user's ID. Mentions written before this change are no longer linked and show as plain text; re-add them to restore the link.
- **Security: dependency updates clearing all critical and high advisories** (3 critical / 19 high → 0). Nuxt 4.4.6 → 4.5.1 (server-side template-injection RCE in island props, cross-user SSR payload-cache disclosure, route-rule middleware bypass), Nodemailer 8 → 9 (a `raw` message option bypassed `disableFileAccess`/`disableUrlAccess`), `@nuxt/devtools` → 3.4.0 (unauthenticated RPC allowing command execution on the developer's host), `@nuxt/ui` 4.7.1 → 4.10.0, DOMPurify 3.4.5 → 3.4.12, plus transitive bumps to `tar`, `shell-quote`, `ws`, `vite`, `postcss`, `js-yaml`, `svgo`, and `brace-expansion`. Vite moved 7 → 8 as part of the Nuxt upgrade. No `pnpm.overrides` were needed — the parent version ranges already allowed the patched releases.
- **Security: `env.sample` no longer ships a working `NUXT_SESSION_PASSWORD`.** It contained a real 44-character key, so any install that copied the file verbatim ran on a cookie-signing key published in the repo. It is now a deliberately too-short placeholder (`replace-me`), which fails fast with "Password string too short (min 32 characters required)" instead of silently working. Existing installs that copied that value should rotate it (`openssl rand -base64 32`); doing so invalidates current sessions.

### Dev
- **Fixed: default AI skills could never reach an existing installation.** `db-seed.ts` guarded its whole default-skills block with "does this table have any rows", so once an install had any skill, newly added defaults were skipped forever — even on a re-run. The guard is now per skill, and product defaults ship via a migration (`0003`) rather than the seed, since `db:migrate` is the only step that runs exactly once on every install. Without this, adding the comment skills would also have made a fresh `pnpm setup` silently skip the two card skills.
- **Integration tests can now run inside the dev container.** The test harness freed its port with `lsof -ti:PORT | xargs kill -9`, which works on macOS but not on Alpine, where `lsof` is a BusyBox symlink that ignores `-t`/`-i` and prints every open file — so `xargs kill -9` killed PID 1 and the test runner, and the suite died with SIGKILL before running a single test. It now resolves the previous server via `/proc` and signals only that process.
- **New `tests/unit/dependency-singletons.test.ts`** asserts that Vue's runtime packages and `vue-router` each resolve to exactly one version in the lockfile. Two copies of Vue break the app at runtime while every API test still passes — which is exactly what the Nuxt 4.5.1 upgrade did, undetected by 481 green tests.
- **Removed the unused `@nuxt/test-utils` devDependency.** Nothing imported it (the e2e harness is hand-rolled), and it declares `vue` as a hard dependency rather than a peer, which is what pinned the duplicate Vue copy.
- **The dev environment no longer uses a `.env` file.** Dev secrets (`NUXT_SESSION_PASSWORD`, the GitHub/Google/Microsoft OAuth client IDs and secrets, AI keys) now come from a 1Password Environment, attached to the app service with `op-env:` in `.zdev/config.yaml`. Only the Environment ID is committed — it isn't secret, and values are fetched by the `op` CLI when a container is created. Requires the beta 1Password CLI (`brew install 1password-cli@beta`) with the desktop-app integration enabled.
  - After rotating or adding variables in 1Password, run `zdev update --refresh-secrets`. A plain `zdev restart` or `zdev update` will not pick them up, since the env is baked in at container creation.
  - Non-secret dev values (`SMTP_HOST`, `APP_URL`, `DATABASE_URL`, the seeded dev logins) stay as explicit `environment:` entries, which always win over injected variables.
  - Host-side `pnpm dev` / `pnpm setup` no longer receive these vars automatically — use `op run` or export them.
- `env.sample` still applies to Docker and manual installs — only the zdev container stopped using a `.env` file.

## v0.6.7 (2026-08-05)

### App
- **Docker: zpinit now supervises the server instead of exec'ing it.** The image sets no `CMD`, which puts [zpinit](https://github.com/0ploy/zpinit) in supervise mode — it stays PID 1, so it reaps zombies for the container's whole lifetime and restarts the Nuxt server with capped-exponential backoff (1s→30s) if it crashes. Previously zpinit exec'd the server and exited, leaving no reaper and no in-container restarts. A readiness probe backs `zpctl ready`, and `zpctl status/restart/tail` now work (they were inert before).
  - Note: after 5 consecutive crashes the service is marked FATAL while the container still reports running. Use `zpctl ready` as a healthcheck if you need the container to fail loudly.
  - Passing a command to `docker run` still overrides this and runs that command once, so the ad-hoc CLI script invocations are unchanged.
- Docker: zpinit is pinned to `0.5.5` instead of `latest` for reproducible builds, and its config is validated at build time (`zpinit --check-config`) so a malformed service file fails the build rather than the deploy.
- **Fix: `pnpm setup` failed on a fresh clone.** `scripts/init-admin.sh` hardcoded `scripts/node_modules/.bin/tsx`, which only exists in the Docker image (`cd scripts && npm install`) and is gitignored otherwise — so the documented first-time bootstrap died at `db:init-admin` with `MODULE_NOT_FOUND`. It now runs `node scripts/user-create.ts` directly, like every other `db:*` / `user:*` script.
- Node 24 LTS and pnpm 11.17.0 are now pinned consistently across `package.json`, the prod image and the dev image. The prod runtime base moves from `alpine:3.23` to `alpine:3.24` (same Node 24.18.x, same native ABI).
- **`tsx` is gone — scripts run as `node scripts/foo.ts`.** Node strips TypeScript natively (default since 22.18), so the same command now works in dev, in prod, and on the host. Previously the prod entrypoint used a vendored tsx binary while dev used `pnpm db:*`, so the two paths differed for no good reason. `tsx` is dropped from `scripts/package.json`, shrinking the prod image by ~16MB (188MB → 172MB), and the runtime image now contains no package manager and no TS loader at all.
  - New `engines.node >= 22.18` in `package.json`. `scripts/*.ts` must stay within erasable syntax (no `enum`, `namespace`, parameter properties or decorators) and use no extension-less relative imports.
  - Ad-hoc invocations change accordingly: `docker exec <container> node scripts/user-create.ts …` (was `node ./scripts/node_modules/.bin/tsx scripts/user-create.ts …`).
- **README corrections.** The documented `SMTP_PORT` default was wrong (`587` — the code falls back to `1025`). The quickstart claimed Node alone was enough, but a fresh Node has no `pnpm` on PATH, so `corepack enable` is now an explicit step alongside the Node 22.18 floor. "All commands work with both `npm run` and `pnpm`" was true of the individual scripts but not `setup`, which chains via pnpm. `db:cleanup` was described as removing "expired sessions and soft-deleted data" — it touches neither; it drops orphaned rows and expired invites/tokens, prunes unused uploads, and VACUUMs.
- **README: new "Development environment (zdev)" section** documenting the containerised dev setup and its seeded logins.

### Dev
- Local dev environment migrated from `.scdev/` to `.zdev/` (the tool's current name and config format). Use `zdev start`; run `zdev update` — not `zdev restart` — after editing `.zdev/config.yaml`.
- **The dev container now boots via zpinit too**, from its own `.zdev/Dockerfile`. On every start it runs install → migrate → seed, then supervises the Nuxt dev server.
- **The dev container is built not to die**, so there's always something to debug. zpinit runs in supervise mode (stays PID 1, restarts the dev server with 1s→30s backoff) and `entrypoint_on_failure = "continue"`, so neither a crashed dev server nor a failed `pnpm install` takes the container down — the error stays in `zdev logs` and `zdev exec app sh` keeps working. `zpctl` is available inside the container (`zpctl status`, `zpctl restart app`, `zpctl tail -f app`).
- **Two fixed dev logins are seeded on every boot** and shown by `zdev info`: `admin@completo.local / admin1234` (admin) and `demo@completo.local / demo1234`. Both are created auto-verified. Dev-only — production still provisions from `ADMIN_USER_*`.
- Dev env wires the shared Mailpit (`SMTP_HOST: mail`), so invitation and verification mails are catchable via `zdev mail`. Because `isEmailEnabled()` keys off `SMTP_HOST`, dev logins require a verified email. `APP_URL` points at the routed HTTPS domain so links in those mails resolve.
- **The dev SQLite DB moved to `/app/data/sqlite.db` in a named volume**, out of the file sync (WAL files over Mutagen risk corruption). It is now the *only* dev database — previously, with no `DATABASE_URL` set, the container fell back to the relative `'sqlite.db'` default and silently shared the host's file. `*.db*` is also in `mutagen.ignore` so a host-side DB can't sync in and shadow it. Dev data is disposable by design: `zdev down -v -f` destroys the volume and the next `zdev start` reseeds from scratch.
- **Docs: `drizzle-kit push` is now documented as prohibited, not a dev shortcut.** Every schema change needs a committed migration. Two verified failure modes are recorded in `CLAUDE.md`: a `push`-built DB can never be migrated (`db:migrate` restarts at `0000` and dies on `table already exists`, which also breaks `pnpm setup`), and pushing then generating the matching migration still breaks the *next* migrate with `duplicate column name`.
- Boot applies committed migrations (`node scripts/db-migrate.ts`) rather than `drizzle-kit push`, which can prompt on destructive changes and would hang in the TTY-less boot.
- **New `zdev migrate` command** (`.zdev/commands/migrate.just`): `zdev migrate` applies pending migrations, plus `generate` (new SQL from schema changes), `seed` and `cleanup`. Each is a thin alias for the same command the container runs at boot. There is deliberately no `push` alias — see below.
- The dev image no longer installs anything with npm (the global `tsx` install is gone) — pnpm is the only package manager in it.
- `.zdev/local/` is gitignored for per-developer overrides (deep-merged onto the committed config).

## v0.6.6 (2026-05-27)

### App
- **BREAKING (security)**: No more default credentials. `pnpm db:seed` no longer creates `admin@example.com / admin1234` or `demo@example.com / demo1234` — production installs no longer ship with well-known accounts. Provision your admin via env vars (Docker) or `pnpm user:create` (dev); the demo project is then created and attributed to that admin. Skipping admin provisioning leaves an empty user table (only AI skills are seeded).
- **BREAKING (Docker)**: when `ADMIN_USER_EMAIL` / `ADMIN_USER_PASSWORD` are unset, no admin is provisioned. Production deploys must set these env vars or provision out-of-band via `docker exec <container> node ./scripts/node_modules/.bin/tsx scripts/user-create.ts <email> <password> "Name" admin`.
- Admin user creation has a **single source of truth**: `scripts/user-create.ts`. The new `scripts/init-admin.sh` is a thin wrapper that calls `user-create.ts --from-env --skip-existing`; dotenv (inside the tsx script) loads `.env` as data, so values are never shell-evaluated. Both the Docker entrypoint and `pnpm db:init-admin` delegate to it.
- New `--from-env` mode on `scripts/user-create.ts` reads `ADMIN_USER_EMAIL` / `ADMIN_USER_PASSWORD` / `ADMIN_USER_NAME` from the environment, implies `admin`, and exits 0 with a `[skipping]` log when the env vars are absent.
- **Security fix**: `scripts/user-create.ts` argument parsing tightened. The `admin` role marker is now only honored as the trailing positional (when there are ≥3 positionals). The previous `args.includes('admin')` check silently elevated any user whose password was literally `"admin"`.
- New `pnpm setup` command chains `db:migrate → db:init-admin → db:seed` so first-time bootstrap is one command in dev.
- The Nitro `init-admin` plugin is removed — no more boot-time DB writes from the server process.
- Demo project + 4 sample cards are attributed to whichever admin exists when the seed runs. If no admin exists yet, the demo project is skipped (the seed logs a hint to run `pnpm user:create ... admin` first, then re-run seed).

## v0.6.5 (2026-05-27)

### App
- Fix: `ADMIN_USER_EMAIL=admin@example.com` (or any other collision with the seed admin) was silently ignored. The seed now creates the admin **from env vars** when `ADMIN_USER_*` is set (falling back to the demo `admin@example.com / admin1234` only when unset), so the env-provided credentials are the working login on first boot.
- Demo project ownership now goes to the admin (env-provided or default). The demo user (`demo@example.com / demo1234`) is added as a regular member instead of the owner. This keeps the env admin in charge of their own deployment and avoids leaving the well-known `admin@example.com / admin1234` credentials in production databases.

## v0.6.4 (2026-05-27)

### App
- **BREAKING**: Renamed `INIT_USER_*` env vars to `ADMIN_USER_*` and dropped the `INIT_USER_ADMIN` flag — the auto-created user is always an admin. Use `ADMIN_USER_EMAIL`, `ADMIN_USER_PASSWORD`, and the optional `ADMIN_USER_NAME`. (Matches the [Plausible](https://plausible.io) naming convention.)
- Bump dependencies to current versions, including `@nuxt/ui` 4.7. Dropdown menu item types now use the stricter `DropdownMenuItem` from `@nuxt/ui` directly.

### Docker
- Replace `entrypoint.sh` with [zpinit](https://github.com/0ploy/zpinit) as PID 1. zpinit runs the scripts in `/etc/zpinit/entrypoint.d/` (migrate → seed → cleanup) and then exec's the Nuxt server.
- Slim the runtime image from 334 MB → 185 MB (-44%): bare `alpine:3.23` + `apk add nodejs` instead of `node:22-alpine` (no npm, no yarn, no corepack).
- Bump base to Node 24 LTS.

### Tooling
- Upgrade pnpm to 11.4.0 (set via `packageManager` field in `package.json` so corepack auto-activates it).
- Add `minimumReleaseAge: 10080` (7-day soak window) in `pnpm-workspace.yaml` — supply-chain defense against freshly-published malicious packages. The Docker build overrides this to 0 since the committed lockfile is already the trust boundary there.
- Migrate `onlyBuiltDependencies` / `ignoredBuiltDependencies` to pnpm 11's `allowBuilds` map.
- Bump CI/release workflows to Node 24 (pnpm version picked up from `packageManager`).

## v0.6.3 (2026-05-06)

### App
- Auto-create initial user on every server startup (dev and production), not just Docker, when `INIT_USER_EMAIL` and `INIT_USER_PASSWORD` are set

## v0.6.2 (2026-05-06)

### App
- Docker: auto-create an initial user on container start when `INIT_USER_EMAIL` and `INIT_USER_PASSWORD` are set (idempotent; supports optional `INIT_USER_NAME` and `INIT_USER_ADMIN`)
- Fix board drag-and-drop so cards no longer briefly reappear in the source column before settling in the target

## v0.6.1 (2026-03-28)

### CLI
- Add `project-create` command to create new projects from the CLI

## v0.6.0 (2026-03-28)

### App
- Add copy-link and copy-ticket-ID hover actions to ticket IDs in board, list, modal, and detail views
- Extract `TicketIdCopy` component and `useCopyTicketId` composable (deduplication)
- Centralize card type definitions using shared types from `~/types/card`
- Switch local dev environment to scdev

### CLI
- Add `briefing` command to view, upload, or clear the project's agent briefing
- Add `list` command with `--status`, `--priority`, `--assignee`, and `--limit` filters
- Add `--all` flag to `next` command to list all cards in a status
- Add `.completo.local` support for local dev credential overrides
- Add `--env-file` global flag to override config from any env file
- Fix project resolution to match by name in addition to slug and ID

## v0.5.1

### App
- Collapsible sidebar with divider-edge chevron toggle and cookie-persisted state
- View header card count now reflects active filters
- Fix typecheck: make useViewPage generic to preserve card subtypes

### CLI
- Improve completo agent skill: add explicit commit step before moving to Done

## v0.5.0

### App
- Add attachment upload to create card form with auto-save on first file upload
- Image picker in description editor works with draft cards during creation
- Discard confirmation when closing create card form with unsaved changes
- Race condition protection for concurrent draft card creation

## v0.4.0

### App
- Add view filters for status, priority, assignee, and tags on both boards and lists
- Filter state persisted per view via settings modal with pill toggles and multi-select
- Compact filter badge in header with tooltip summary replaces priority buttons and tag pills
- Redesigned View Settings modal: Name, Columns, and Filters sections
- Fix pre-existing ESLint v-html warning in ProseDescription component

## v0.3.0

### App
- Display app version on profile page

### CLI
- Mask API token in `completo config` prompt

### Infra
- Gate release builds (Docker, CLI binaries) behind CI checks

## v0.2.0

### App
- Add `GET /api/projects/{id}/cards` endpoint with filtering (status, assignee, priority, tags, due date), sorting, and pagination
- Fix OpenAPI spec: members endpoint response shape, missing fields on Card/Status/List schemas

### CLI
- Initial release: fetch, move, assign, update, search cards
- Project-local `.completo` config file support
- Self-update command
- Key-value output format (token-efficient for AI agents)
- `--json` flag for programmatic use

## v0.1.0

- Initial release
