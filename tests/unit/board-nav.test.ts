import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { nextCard, arrowKeysAreClaimed } from '../../app/utils/board-nav'

const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const COLUMNS = [
  { id: 'backlog' },
  { id: 'todo' },
  { id: 'empty' },
  { id: 'review' }
]

const CARDS = {
  backlog: [{ id: 1 }, { id: 2 }, { id: 3 }],
  todo: [{ id: 10 }, { id: 11 }],
  empty: [],
  review: [{ id: 20 }]
}

const at = (currentColumnId: string, currentCardId: number) => ({
  columns: COLUMNS,
  cardsByColumn: CARDS,
  currentColumnId,
  currentCardId
})

describe('walking a column', () => {
  it('moves down and up within the column', () => {
    expect(nextCard({ ...at('backlog', 2), direction: 'down' })).toEqual({ cardId: 3, columnId: 'backlog' })
    expect(nextCard({ ...at('backlog', 2), direction: 'up' })).toEqual({ cardId: 1, columnId: 'backlog' })
  })

  it('stops at both ends rather than wrapping', () => {
    // A dead end is how you learn you are at the end. Wrapping teleports you to
    // the other end and the next press looks like the column re-ordered itself.
    expect(nextCard({ ...at('backlog', 3), direction: 'down' })).toBeNull()
    expect(nextCard({ ...at('backlog', 1), direction: 'up' })).toBeNull()
  })

  it('is reversible', () => {
    const down = nextCard({ ...at('backlog', 1), direction: 'down' })!
    const back = nextCard({ ...at(down.columnId, down.cardId), direction: 'up' })

    expect(back).toEqual({ cardId: 1, columnId: 'backlog' })
  })

  it('does nothing for a card that is not in the column', () => {
    // The card was filtered out or moved while the panel was open.
    expect(nextCard({ ...at('backlog', 999), direction: 'down' })).toBeNull()
  })
})

describe('crossing to another column', () => {
  it('lands on the top card of the next column', () => {
    expect(nextCard({ ...at('backlog', 3), direction: 'right' })).toEqual({ cardId: 10, columnId: 'todo' })
  })

  it('skips a column with nothing in it', () => {
    // Landing there would leave no card to show, which reads as the key having
    // failed rather than as an empty column.
    expect(nextCard({ ...at('todo', 10), direction: 'right' })).toEqual({ cardId: 20, columnId: 'review' })
  })

  it('stops at the ends of the board', () => {
    expect(nextCard({ ...at('backlog', 1), direction: 'left' })).toBeNull()
    expect(nextCard({ ...at('review', 20), direction: 'right' })).toBeNull()
  })

  it('is deliberately not reversible', () => {
    // → then ← returns to the *top* of where you started, not to the card you
    // left. Documented here so the asymmetry is a decision on the record rather
    // than something a later reader takes for a bug: preserving the index breaks
    // on columns of different lengths, and remembering a position per column
    // makes → land mid-column for reasons the user cannot see.
    const right = nextCard({ ...at('backlog', 3), direction: 'right' })!
    const back = nextCard({ ...at(right.columnId, right.cardId), direction: 'left' })

    expect(back).toEqual({ cardId: 1, columnId: 'backlog' })
    expect(back!.cardId).not.toBe(3)
  })
})

/**
 * Every one of these owns the arrow keys more specifically than "show me another
 * card" does, so navigation stands down for all of them.
 */
describe('yielding the arrow keys', () => {
  function fakeDoc(opts: { active?: Partial<HTMLElement>, roles?: string[] }): Document {
    const roles = opts.roles ?? []
    return {
      activeElement: opts.active ?? { tagName: 'BODY', isContentEditable: false },
      querySelector: (sel: string) => roles.some(r => sel.includes(`"${r}"`)) ? {} : null,
      querySelectorAll: (sel: string) =>
        roles.filter(r => sel.includes(`"${r}"`)).map(() => ({}))
    } as unknown as Document
  }

  it('runs when nothing else wants them', () => {
    expect(arrowKeysAreClaimed(fakeDoc({ roles: ['dialog'] }))).toBe(false)
  })

  it('stands down for a caret in a text field', () => {
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
      expect(arrowKeysAreClaimed(fakeDoc({ active: { tagName } as HTMLElement, roles: ['dialog'] })), tagName).toBe(true)
    }
  })

  it('stands down for a contenteditable', () => {
    const active = { tagName: 'DIV', isContentEditable: true } as HTMLElement

    expect(arrowKeysAreClaimed(fakeDoc({ active, roles: ['dialog'] }))).toBe(true)
  })

  it('stands down for an open menu, list or calendar', () => {
    for (const role of ['menu', 'listbox', 'grid']) {
      expect(arrowKeysAreClaimed(fakeDoc({ roles: ['dialog', role] })), role).toBe(true)
    }
  })

  it('stands down for a confirmation stacked on the panel', () => {
    // The panel is one dialog; a second is something asking a question.
    expect(arrowKeysAreClaimed(fakeDoc({ roles: ['dialog', 'dialog'] }))).toBe(true)
  })
})

/**
 * The keys alone would hand this feature to the minority and hide it from
 * everyone else — the app is pointer-first by decision, so navigation that only
 * exists on the keyboard is the wrong shape for it. Two chevrons beside the
 * close button give the mouse the same ability, and their tooltips are what
 * teach the keys, so the visible control and the invisible one arrive together.
 */
describe('the panel offers the same walk to the mouse', () => {
  const modal = read('app/components/CardModal.vue')

  /** The `NAV_CONTROLS` declaration the four buttons are rendered from. */
  const controls = modal.slice(modal.indexOf('const NAV_CONTROLS'), modal.indexOf('] as const'))

  it('declares a control for all four directions, named for screen readers', () => {
    // All four, not just the vertical pair: a card panel gives no hint that
    // columns can be stepped through, and arrow keys in list-shaped apps are
    // usually vertical only, so there is no analogy to carry the horizontal.
    expect(controls).toContain('aria: \'Previous card in this column\'')
    expect(controls).toContain('aria: \'Next card in this column\'')
    expect(controls).toContain('aria: \'First card of the previous column\'')
    expect(controls).toContain('aria: \'First card of the next column\'')
  })

  it('teaches every shortcut from its tooltip', () => {
    // Drop the keys and the feature goes back to being a secret, which is the
    // state this change exists to end.
    for (const key of ['arrowup', 'arrowdown', 'arrowleft', 'arrowright']) {
      expect(controls, key).toContain(`kbd: '${key}'`)
    }
    expect(modal).toContain('<UiKey')
    expect(modal).toContain(':value="control.kbd"')
  })

  it('draws the keys rather than typing them', () => {
    // Not the tooltip's own `:kbds` prop: it takes UKbd *props*, and these keys
    // have to be icons because no font carries ← and → (see UiKey and
    // key-glyphs.test.ts). The slot hands back Nuxt UI's `ui`, so the styling
    // stays the component's rather than a copy of it.
    expect(modal).toMatch(/#content="\{ ui \}"/)
    expect(modal).toContain('ui.kbds()')
    expect(modal).not.toMatch(/:kbds=/)
  })

  it('uses chevrons, never arrows', () => {
    // On a kanban board an up-arrow beside a card reads as *move this card up*
    // and a right-arrow as *move it to the next column* — both real operations
    // here, so an arrow would name the wrong one. A chevron says "there is more
    // this way" without claiming to move anything. The literal keys still show,
    // as UKbd inside the tooltips, where they mean the keyboard not the action.
    for (const side of ['up', 'down', 'left', 'right']) {
      expect(controls, side).toContain(`i-lucide-chevron-${side}`)
      expect(modal, side).not.toContain(`i-lucide-arrow-${side}`)
    }
  })

  it('greys out any direction that goes nowhere', () => {
    for (const flag of ['hasPrev', 'hasNext', 'hasPrevColumn', 'hasNextColumn']) {
      expect(controls, flag).toContain(`flag: '${flag}'`)
    }
    expect(modal).toContain(':disabled="!nav[control.flag]"')
  })

  it('shows them only where there is a set to walk', () => {
    // The board passes `nav`; the list view opens this same panel and has no
    // column to step through, so the absence of the prop is what hides them.
    expect(modal).toMatch(/v-if="nav"/)
    expect(read('app/pages/projects/[slug]/boards/[boardSlug]/index.vue')).toContain(':nav="cardNav"')
    expect(read('app/pages/projects/[slug]/lists/[listSlug]/index.vue')).not.toContain(':nav=')
  })
})
