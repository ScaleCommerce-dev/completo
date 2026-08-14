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
  it('opens below the control, clear of the window edge', () => {
    // The properties that matter, not the object mirrored back at itself: the
    // previous version restated all three values, so it could only fail if
    // somebody edited both the constant and this line. `sideOffset` is left to the
    // test below, which uses it to find components carrying their own placement.
    expect(FIELD_MENU_PLACEMENT.side).toBe('bottom')
    expect(FIELD_MENU_PLACEMENT.collisionPadding).toBeGreaterThan(0)
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
 * The four `FieldMenu` fields get their header from `type: 'label'`. A calendar is
 * not a list of menu items, so the due-date picker has to carry the same markup by
 * hand — which is precisely the kind of copy that goes stale. Compared against the
 * classes Nuxt UI itself renders for a menu label, so upstream drift fails here
 * and names the file to update.
 */
describe('the due-date picker is headed like the field menus', () => {
  const picker = readFileSync(join(ROOT, 'app/components/DueDatePicker.vue'), 'utf8')

  /**
   * Nuxt UI's `dropdownMenu` theme, from the bundled file whose name carries a
   * build hash. `label` is assembled the way the component assembles it: the base
   * slot plus the variant for the size the menu defaults to.
   */
  const themeDir = join(ROOT, 'node_modules/@nuxt/ui/dist/shared')
  const theme = readFileSync(join(themeDir, readdirSync(themeDir).find(f => /^ui\..*\.mjs$/.test(f))!), 'utf8')
  const dropdownMenu = theme.slice(theme.indexOf('const dropdownMenu ='), theme.indexOf('const ', theme.indexOf('const dropdownMenu =') + 1))
  const defaultSize = dropdownMenu.match(/defaultVariants: \{\s*size: "(\w+)"/)?.[1] ?? ''
  const upstreamLabel = [
    dropdownMenu.match(/slots: \{[\s\S]*?\n {4}label: "([^"]*)"/)?.[1] ?? '',
    dropdownMenu.match(new RegExp(`${defaultSize}: \\{\\s*\\n\\s*label: "([^"]*)"`))?.[1] ?? ''
  ].join(' ').split(/\s+/).filter(Boolean)

  it('names the field it edits', () => {
    expect(picker).toContain('Due date')
  })

  it('uses the label classes Nuxt UI renders for a menu label', () => {
    // Set equality against upstream, minus the two deltas this header genuinely
    // has: no `gap-1.5`, because there is no leading icon to space, and the divider
    // the menu items get from their viewport's `divide-y`, which a hand-built
    // header has to draw itself.
    //
    // As a set rather than as a pinned string in upstream's order: the previous
    // version could not tell an upstream change from a deliberate restyle here,
    // and failed on either.
    const header = picker.match(/<div class="([^"]*)">\s*\n\s*Due date/)?.[1] ?? ''
    const expected = new Set([...upstreamLabel.filter(t => t !== 'gap-1.5'), 'border-b', 'border-default'])

    expect(upstreamLabel.length).toBeGreaterThan(0)
    expect(new Set(header.split(/\s+/).filter(Boolean))).toEqual(expected)
  })

  it('is not restyled from app.config, which would make the comparison above a lie', () => {
    // The app overrides `content` and `item` on this theme but not `label`. If that
    // changes, the override has to be folded into `upstreamLabel`.
    const config = readFileSync(join(ROOT, 'app/app.config.ts'), 'utf8')
    const override = config.match(/dropdownMenu: \{([\s\S]*?)\n {4}\}/)?.[1] ?? ''

    expect(override).not.toMatch(/\blabel:/)
  })
})
