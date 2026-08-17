import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '../..')

/**
 * One overlay form per object.
 *
 * A card is a panel and everything else is a centred dialog, and the reason is
 * not that panels suit records: it is that the board *reveals the card's column
 * beside the panel* (`KanbanBoard.revealColumn`, measured in
 * `card-panel.test.ts`), so reading a card and then moving it does not mean
 * closing anything. Nothing else in the app has a surface behind it that the
 * task needs.
 *
 * The rule is per **object**, not per interaction — card create and card edit
 * are both the panel — because a user learns one shape per thing, not one shape
 * per verb. That is also why this file checks *hosts* rather than counting call
 * sites: each overlay primitive gets exactly one file it may appear in, so a
 * second spelling of an existing object is a test failure rather than a code
 * review someone has to notice.
 *
 * What this cannot check is the choice itself. A new object that genuinely wants
 * a panel is a design argument to have — and the answer is a named entry here
 * with the argument written beside it, exactly as `stacking.test.ts` and
 * `design-tokens.test.ts` take theirs. Widening a pattern to make this pass, or
 * deleting the sweep, are the two failures.
 */

/**
 * Comments blanked rather than stripped, so a failure's line numbers still point
 * at the source. Required, not tidiness: `ui/Modal.vue`'s own prose writes
 * `<UModal>` while describing the sites it supersedes, and every mention in this
 * file's own header would otherwise count as a violation.
 */
const blankComments = (text: string) => text
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
  .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''))

const FILES = execSync(`find ${ROOT}/app -name '*.vue'`, { encoding: 'utf8' })
  .trim().split('\n')

const SOURCE = new Map(
  FILES.map(f => [relative(ROOT, f), blankComments(readFileSync(f, 'utf8'))])
)

/** Occurrences of `<Name` as an element, per file. Matches self-closing tags too. */
function sites(name: string): Record<string, number> {
  const found: Record<string, number> = {}
  for (const [file, text] of SOURCE) {
    const n = [...text.matchAll(new RegExp(`<${name}(?=[\\s>/])`, 'g'))].length
    if (n) found[file] = n
  }

  return found
}

/**
 * The overlay forms, and the one file each is allowed to live in.
 *
 * `null` bans a form outright. `UDrawer` is Nuxt UI's bottom sheet — a fourth
 * form nothing has asked for, listed so that reaching for one is a decision
 * rather than an import.
 *
 * Menus are deliberately absent. `UPopover`, `UDropdownMenu` and `UTooltip` are
 * a different vocabulary (`FieldMenu`, `StatusMenu`, `PriorityMenu`) and are not
 * overlay forms: they attach to the control that opened them, carry no title and
 * commit nothing. Adding them here would ban the app's own primitives.
 */
const FORMS: Record<string, { host: string | null, why: string }> = {
  USlideover: {
    host: 'app/components/CardModal.vue',
    why: 'The one panel. The board reveals the card\'s column beside it; a centred dialog would cover the board the card is being moved on.'
  },
  UModal: {
    host: 'app/components/ui/Modal.vue',
    why: 'The one dialog shell — see MIGRATION_OWED for the sites that still hand-roll their own.'
  },
  UDashboardSearch: {
    host: 'app/layouts/default.vue',
    why: 'The command palette. A Nuxt UI composite that renders its own dialog and cannot wear `ui/Modal`; one per app, in the layout, raised by `.palette-on-top` (see stacking.test.ts).'
  },
  UDrawer: {
    host: null,
    why: 'A fourth overlay form. Nothing has asked for one.'
  }
}

/**
 * Raw `<UModal>` sites predating `ui/Modal.vue`. **Empty, and that is the point.**
 *
 * It held seven across six files when this file was written: `ui/Modal.vue` had
 * been built to end four incompatible dialog structures, reached three call sites,
 * and the other seven went on hand-rolling the structures it documents. The list
 * emptied in two passes — five shells, then `ViewConfigModal` once its rebuild
 * landed — and it emptied *because* the assertion runs both ways: each migration
 * broke the suite by naming its own stale entry.
 *
 * Keep the mechanism. Refilling it is how a hand-rolled dialog gets recorded as
 * owed rather than argued for, and an empty debt list still fails on a new one:
 * `each form has exactly one host` is what catches that, and this only decides
 * whether the site is a known defect or a surprise.
 *
 * `ui/Modal.vue` used to carry the enumeration in prose, by file and line, and all
 * seven references had gone stale by 1 to 51 lines while still reading as current.
 * That is the argument for the list living somewhere that recomputes.
 */
const MIGRATION_OWED: Record<string, { count: number, why: string }> = {}

describe('overlay forms', () => {
  it('each form has exactly one host', () => {
    const wrong: string[] = []

    for (const [name, { host }] of Object.entries(FORMS)) {
      for (const file of Object.keys(sites(name))) {
        if (file === host) continue
        // The debt list is scoped to UModal: it records sites that predate the
        // shell, not permission for a second panel or a second palette.
        if (name === 'UModal' && file in MIGRATION_OWED) continue
        wrong.push(`${file}: <${name}> — ${host ? `only ${host} may host it` : 'banned'}`)
      }
    }

    expect(wrong.sort(), 'an overlay form outside its host — see FORMS for what each is for').toEqual([])
  })

  it('the hosts actually host, so the rule is not vacuous', () => {
    // Without this, renaming CardModal or dropping the USlideover would leave
    // every assertion above passing against a form nothing uses.
    for (const [name, { host }] of Object.entries(FORMS)) {
      if (!host) continue
      expect(sites(name)[host], `${host} no longer contains <${name}>`).toBeGreaterThanOrEqual(1)
    }
  })

  it('the raw-UModal debt matches the list exactly', () => {
    const shell = FORMS.UModal!.host
    const found = Object.fromEntries(
      Object.entries(sites('UModal'))
        .filter(([file]) => file !== shell)
        .map(([file, count]) => [file, count])
    )
    const listed = Object.fromEntries(
      Object.entries(MIGRATION_OWED).map(([file, { count }]) => [file, count])
    )

    // Both directions. A new hand-rolled dialog fails; so does an entry left
    // behind after its file was migrated.
    expect(found, 'raw <UModal> sites drifted from MIGRATION_OWED — migrate the file, or delete its entry').toEqual(listed)
  })

  it('the debt is shrinking, and says so in numbers', () => {
    const owed = Object.values(MIGRATION_OWED).reduce((n, { count }) => n + count, 0)
    const total = Object.values(sites('UModal')).reduce((n, c) => n + c, 0)

    // Was 7 of 8 when this file was written, which is why `ui/Modal.vue` calling
    // itself "the one dialog shell" read as done when it was not. Zero now, so the
    // shell is the only `<UModal>` in the app. Raising this ceiling to admit a new
    // hand-rolled dialog is the one edit that is never the fix.
    expect(owed).toBe(0)
    expect(total, 'the shell itself, and nothing else').toBe(1)
  })
})
