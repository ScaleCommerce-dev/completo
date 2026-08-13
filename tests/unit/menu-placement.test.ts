import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  FIELD_MENU_PLACEMENT,
  FIELD_MENU_ALIGN_START,
  FIELD_MENU_ALIGN_END
} from '../../app/utils/menu-placement'

const ROOT = join(import.meta.dirname, '../..')

/**
 * Where a field menu opens used to be written out at each call site, and the
 * copies had drifted: the board passed `align: 'end'`, the list and the card
 * panel `align: 'start'`, and the card panel left `collisionPadding` off
 * entirely. Same guard as `list-fields.test.ts` — one declaration, and a test
 * that notices when a component starts carrying its own.
 */
describe('field menu placement', () => {
  it('opens below the control, 4px down, 8px clear of the window edge', () => {
    expect(FIELD_MENU_PLACEMENT).toEqual({ side: 'bottom', sideOffset: 4, collisionPadding: 8 })
  })

  it('offers exactly two alignments, differing only in the alignment axis', () => {
    expect(FIELD_MENU_ALIGN_START).toEqual({ ...FIELD_MENU_PLACEMENT, align: 'start' })
    expect(FIELD_MENU_ALIGN_END).toEqual({ ...FIELD_MENU_PLACEMENT, align: 'end' })
  })
})

/**
 * `sideOffset` is the tell: it appears in a hand-written placement object and
 * nowhere else, so a component that grows its own is easy to spot without
 * parsing the template.
 */
describe('no component states its own placement', () => {
  function vueFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) return vueFiles(path)
      return entry.name.endsWith('.vue') ? [path] : []
    })
  }

  it('routes every field menu through the shared constants', () => {
    const offenders = [...vueFiles(join(ROOT, 'app/components')), ...vueFiles(join(ROOT, 'app/pages'))]
      .filter(path => readFileSync(path, 'utf8').includes('sideOffset'))
      .map(path => path.slice(ROOT.length + 1))

    expect(offenders).toEqual([])
  })
})

/**
 * The four `FieldMenu` fields get their header from `type: 'label'`. A calendar
 * is not a list of menu items, so the due-date picker has to carry the same
 * markup by hand — which is precisely the kind of copy that goes stale. If Nuxt
 * UI's label slot changes, this fails and names the file to update.
 */
describe('the due-date picker is headed like the field menus', () => {
  const picker = readFileSync(join(ROOT, 'app/components/DueDatePicker.vue'), 'utf8')

  it('names the field it edits', () => {
    expect(picker).toContain('Due date')
  })

  it('uses the label classes Nuxt UI renders for a menu label', () => {
    // Read off the rendered DOM of an open status menu, minus `gap-1.5` (there
    // is no leading icon to space) and plus the divider the menu gets from its
    // viewport's `divide-y`.
    expect(picker).toContain('font-semibold text-highlighted p-1.5 text-sm border-b border-default')
  })
})
