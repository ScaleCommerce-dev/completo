import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execSync } from 'node:child_process'

const ROOT = join(import.meta.dirname, '../..')

/**
 * The board card defers its overlays, and `<component :is>` is how.
 *
 * A Reka overlay root — `UDropdownMenu` through `FieldMenu`, `UPopover` through
 * `DueDatePicker`, `UTooltip` — costs about 2ms to instantiate and renders no
 * DOM at all until it opens. `KanbanCard` mounts nine of them and the board
 * mounts a card per row, so on a 93-card board that was 757ms of unbroken
 * blocked main thread after the request had already landed — 83% of the board's
 * whole render, for machinery nobody had reached for yet. Gating them on `armed`
 * took the same board to ~120ms, measured five runs a side.
 *
 * Two things have to hold for that to keep working, and neither is visible in a
 * diff that breaks it.
 */

const blankComments = (text: string) => text
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
  .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''))

const FILES = execSync(`find ${ROOT}/app -name '*.vue'`, { encoding: 'utf8' })
  .trim().split('\n')

const SOURCE = new Map(
  FILES.map(f => [relative(ROOT, f), blankComments(readFileSync(f, 'utf8'))])
)

const CARD = SOURCE.get('app/components/KanbanCard.vue')!

describe('the board card defers its overlays', () => {
  /**
   * Derived from the card's own `#components` import rather than listed here: a
   * fifth field control added to the strip is covered the day it is imported,
   * and a control that stops being lazy fails on the line that made it eager.
   */
  const deferred = [...CARD.matchAll(/import \{([^}]*)\} from '#components'/g)]
    .flatMap(m => m[1]!.split(','))
    .map(n => n.trim())
    .filter(n => n && n !== 'UiPassthrough')

  it('imports the overlays it defers', () => {
    expect(deferred.length).toBeGreaterThanOrEqual(5)
  })

  it.each(deferred)('reaches %s only through wrap()', (name) => {
    // A literal `<TagMenu>` anywhere in the template is an overlay that mounts
    // with the card, whatever the rest of the strip does.
    expect(CARD).not.toMatch(new RegExp(`<${name}(?=[\\s>/])`))
    expect(CARD).toMatch(new RegExp(`:is="wrap\\(${name}\\)"`))
  })

  /**
   * The stand-in has to be cheaper than the thing it stands in for, which a
   * component that renders anything of its own would not be. `UiPassthrough`
   * being slot-only is what makes the swap a saving rather than a shuffle.
   */
  it('stands in with a component that renders only its slot', () => {
    const passthrough = SOURCE.get('app/components/ui/Passthrough.vue')!
    const template = passthrough.match(/<template>([\s\S]*)<\/template>/)![1]!
    expect(template.trim()).toBe('<slot />')
  })
})

/**
 * Nuxt resolves `<TagMenu>` to an import by reading the *template* at compile
 * time, so nothing registers the name `'TagMenu'` at runtime. A `<component
 * :is>` handed that string resolves against nothing and Vue renders a literal
 * `<tagmenu>` element instead — no error, no warning in a built app, and a card
 * that looks very nearly right: the button is still there, the menu behind it
 * simply never exists. This shipped for one commit here.
 *
 * The rule is therefore about the *binding*, not about any one component: a
 * capitalised bare string passed to `:is` is a component name that will not
 * resolve. Lowercase strings are HTML tags and are the legitimate use.
 */
describe('a dynamic component is given a component, not its name', () => {
  const offenders: string[] = []

  for (const [file, text] of SOURCE) {
    for (const m of text.matchAll(/:is="([^"]*)"/g)) {
      // Any single-quoted string inside the binding — `:is="'UTooltip'"` and
      // `:is="armed ? 'UTooltip' : 'UiPassthrough'"` fail the same way.
      for (const s of m[1]!.matchAll(/'([^']*)'/g)) {
        if (/^[A-Z]/.test(s[1]!)) offenders.push(`${file}: :is="${m[1]}"`)
      }
    }
  }

  it('never names one with a capitalised string', () => {
    expect(offenders).toEqual([])
  })
})

/**
 * One definition per field for a trigger's accessible name.
 *
 * These used to live in the menu components and reach the call site through
 * their slot, because written at each call site they had drifted — an unset
 * status read "none" in the card panel and "Set a status" in the list. The board
 * card broke that arrangement by needing the name *without* the menu that owns
 * the field, so they moved to `app/utils/field-labels.ts` and the menus read
 * them from there.
 *
 * The failure this catches is the same one as before, one layer along: a call
 * site that writes the sentence itself rather than calling for it.
 */
describe('field trigger names have one definition', () => {
  const LABELS = readFileSync(join(ROOT, 'app/utils/field-labels.ts'), 'utf8')

  /**
   * The *tail* of each template literal — what follows the interpolated value.
   *
   * Only the tail discriminates. The head does not: the board card's tooltip
   * says "Priority: Medium" while its accessible name says "Priority: Medium.
   * Change priority", and those are two sentences for two readers, not one
   * sentence written twice. It is the imperative half that marks a call site
   * which has written a trigger name of its own.
   */
  const owned = [...LABELS.matchAll(/`[^`]*\}([^`{]+)`/g)]
    .map(m => m[1]!)
    .filter(t => t.trim().length > 5)

  it('owns some', () => {
    expect(owned).toContain('. Change status')
    expect(owned).toContain('. Change due date')
  })

  it.each(owned)('writes %j nowhere else', (fragment) => {
    const elsewhere = [...SOURCE].filter(([, text]) => text.includes(fragment))
    expect(elsewhere.map(([f]) => f)).toEqual([])
  })
})
