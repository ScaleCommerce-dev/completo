import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  nextCard,
  arrowKeysAreClaimed,
  columnPosition,
  dropPosition,
  nextInSequence,
  sequencePosition,
  groupedSequence
} from '../../app/utils/board-nav'

const ROOT = join(import.meta.dirname, '../..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

/**
 * Source with its comments blanked — for the assertions that ban an identifier
 * rather than requiring one. `useCardWalk`'s prose names `hasPrevColumn` while
 * explaining why it never sets it, which is exactly the sentence a raw substring
 * ban reads as the violation. Blanked rather than stripped so a failure's line
 * numbers still point at the source.
 */
const code = (p: string) => read(p)
  .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ''))
  .replace(/\/\/[^\n]*/g, m => m.replace(/[^\n]/g, ''))
  .replace(/<!--[\s\S]*?-->/g, m => m.replace(/[^\n]/g, ''))

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
 * The walker's readout. It counts the same filtered ordering the chevrons walk,
 * so what it says agrees with what stepping does.
 */
describe('the position readout', () => {
  it('is one-based, over the visible column', () => {
    expect(columnPosition(CARDS, 'backlog', 2)).toEqual({ index: 2, count: 3 })
    expect(columnPosition(CARDS, 'review', 20)).toEqual({ index: 1, count: 1 })
  })

  it('is null when the open card is not in the visible set', () => {
    // A filter can hide the card the panel is showing; a readout would then
    // name a position in a list the user cannot see.
    expect(columnPosition(CARDS, 'backlog', 999)).toBeNull()
    expect(columnPosition(CARDS, 'missing-column', 1)).toBeNull()
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

  /** The declaration parsed back into entries, so each can answer for itself. */
  const entries = [...controls.matchAll(/\{([^}]*)\}/g)]
    .map(m => Object.fromEntries([...m[1]!.matchAll(/(\w+): '([^']*)'/g)].map(f => [f[1]!, f[2]!])))

  /**
   * The labels moved out of `NAV_CONTROLS` into a computed, because two of them
   * now depend on the shape: on a sequence there is no column to be "in". Parsed
   * per branch of the ternary, so both wordings answer for themselves.
   */
  const navAria = modal.slice(modal.indexOf('const navAria'), modal.indexOf('}))', modal.indexOf('const navAria')))
  const ariaStrings = [...navAria.matchAll(/'([^']*)'|`([^`]*)`/g)].map(m => m[1] ?? m[2]!)

  it('declares a control for all four directions, named for screen readers', () => {
    // All four, not just the vertical pair: a card panel gives no hint that
    // columns can be stepped through, and arrow keys in list-shaped apps are
    // usually vertical only, so there is no analogy to carry the horizontal.
    //
    // The labels are checked for saying which way they go and for being distinct;
    // the sentences themselves are copy, and pinning them verbatim — which is
    // what this did — made rewording one of them a test failure.
    expect(entries.map(e => e.dir).sort()).toEqual(['next', 'nextColumn', 'prev', 'prevColumn'])

    for (const control of entries) {
      const labels = ariaStrings.filter(s =>
        s.toLowerCase().includes(control.dir!.startsWith('prev') ? 'previous' : 'next'))
      expect(labels.length, control.dir).toBeGreaterThan(0)
    }

    // Every column label names the column; the readouts stay distinguishable.
    for (const label of ariaStrings.filter(s => /column/i.test(s))) {
      expect(label.toLowerCase()).toMatch(/previous|next|this column/)
    }
    expect(new Set(ariaStrings).size, 'two controls announcing the same thing').toBe(ariaStrings.length)
  })

  it('says "in this column" only where there are columns', () => {
    // The readout is announced, so it has to be true rather than merely
    // consistent with the board: on a list and on My Tasks the walked set is the
    // whole view, and naming a column there names something the surface has not
    // got. Both branches exist, and the shape is read off the column flags rather
    // than taken as a second prop that could be set to disagree with them.
    expect(navAria).toContain('navIsGrid')
    expect(ariaStrings.some(s => /in this column/i.test(s)), 'no column-scoped wording').toBe(true)
    expect(
      ariaStrings.some(s => /^(previous|next) card$/i.test(s)),
      'no unscoped wording for a sequence host'
    ).toBe(true)
    expect(modal).toMatch(/const navIsGrid = computed\(\(\) => props\.nav\?\.hasPrevColumn !== undefined\)/)
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
    //
    // Asserted on each control's own icon, paired with the key it teaches. The ban
    // this replaces ran over all of CardModal as a substring check, so it also
    // forbade `i-lucide-arrow-up-right` — a glyph that means neither of the two
    // operations the rule is about.
    for (const control of entries) {
      expect(control.icon, control.dir).toMatch(/^i-lucide-chevron-/)
      expect(control.icon, control.dir).toBe(`i-lucide-chevron-${control.kbd!.replace('arrow', '')}`)
    }
  })

  it('greys out any direction that goes nowhere', () => {
    for (const flag of ['hasPrev', 'hasNext', 'hasPrevColumn', 'hasNextColumn']) {
      expect(controls, flag).toContain(`flag: '${flag}'`)
    }
    expect(modal).toContain(':disabled="!nav[control.flag]"')
  })

  it('shows them only where there is a set to walk', () => {
    // The absence of the prop is what hides the tray. Every host that opens the
    // panel over a set it can walk passes one; the create-card panel does not,
    // because a card being made is not in any set yet.
    expect(modal).toMatch(/v-if="nav"/)
    for (const page of [
      'app/pages/projects/[slug]/boards/[boardSlug]/index.vue',
      'app/pages/projects/[slug]/lists/[listSlug]/index.vue',
      'app/pages/my-tasks.vue'
    ]) {
      expect(read(page), page).toContain(':nav="cardNav"')
    }
  })

  it('omits the horizontal pair on a sequence rather than greying it out', () => {
    // A permanently dead chevron is worse than no chevron: it claims a second
    // axis the surface has not got. `undefined` and `false` therefore mean
    // different things on the column flags — `false` is a one-column board, which
    // still shows the control disabled — so the render is gated on presence, not
    // on truth, and the hairline rules that separate the two axes go with them.
    expect(modal).toContain('v-if="nav[control.flag] !== undefined"')
    expect(modal).toContain(':disabled="!nav[control.flag]"')
    expect(modal).toContain(`v-if="control.before === 'rule' && navIsGrid"`)

    // Only the board builds the column flags. `useCardWalk` is what the other two
    // hosts get their `nav` from, and it returns the vertical pair alone.
    const walk = code('app/composables/useCardWalk.ts')
    expect(walk).toContain('hasPrev:')
    expect(walk).toContain('hasNext:')
    expect(walk, 'the sequence walker must not claim a horizontal axis').not.toContain('hasPrevColumn')
    expect(walk).not.toContain('hasNextColumn')
  })

  it('binds only the vertical arrows on a sequence', () => {
    // ←/→ mean nothing on this shape, and swallowing them would break caret
    // movement that nothing else claims. The claim check is the board's, so the
    // two shapes stand down from a text field or an open picker identically.
    const walk = code('app/composables/useCardWalk.ts')
    expect(walk).toMatch(/ArrowUp: 'prev'/)
    expect(walk).toMatch(/ArrowDown: 'next'/)
    expect(walk).not.toContain('ArrowLeft')
    expect(walk).not.toContain('ArrowRight')
    expect(walk).toContain('arrowKeysAreClaimed(document)')
  })

  it('walks the order the table drew, not one the page recomputed', () => {
    // `ListView.sortedCards` is not a function of its props: `userSortField`
    // overrides `sortField` from the first header click, and `@sort` only reaches
    // the page when the viewer may persist one. So a page-side sort agrees with
    // the rows until somebody without permission clicks a column header.
    const listView = read('app/components/ListView.vue')
    expect(listView).toMatch(/'order': \[cardIds: number\[\]\]/)

    for (const page of ['app/pages/projects/[slug]/lists/[listSlug]/index.vue', 'app/pages/my-tasks.vue']) {
      expect(read(page), page).toContain('@order=')
    }
  })

  it('reports the order by value, and never from an effect over the array', () => {
    // The regression this exists for, because it presented as something else
    // entirely: every overlay in the app stopped opening, the profile menu
    // included, with no error logged.
    //
    // `sortedCards` returns a fresh array each evaluation, so emitting from a
    // `watchEffect` over it re-fires on renders where the ordering has not moved.
    // The host stores what it receives, that invalidates a computed the host
    // renders, and the render brings us back here. With one ListView per project
    // group on My Tasks, the loop kept Vue's post-flush queue saturated and no
    // teleported subtree ever finished mounting — a jammed scheduler reads exactly
    // like a z-index or portal bug, and nothing in the console says otherwise.
    //
    // Comparing the joined ids is what makes a same-order re-render a no-op.
    const source = code('app/components/ListView.vue')
    const emitStmt = source.match(/watch\(\s*orderKey[\s\S]*?\)\n/)?.[0] ?? ''

    expect(source, 'orderKey is what makes the emit value-compared').toMatch(/const orderKey = computed\(\(\) => orderedIds\.value\.join\(/)
    expect(emitStmt, 'the emit must be driven by the key, not the array').toContain(`emit('order'`)
    expect(emitStmt, 'later emits belong behind the DOM patch').toContain(`flush: 'post'`)
    expect(emitStmt, 'an immediate callback runs during the host render').not.toContain('immediate')
    expect(source, 'the first emit belongs in onMounted, not an immediate watcher').toMatch(/onMounted\(\(\) => emit\('order'/)

    // The shape that caused it, banned by name in either spelling.
    expect(source).not.toMatch(/watchEffect\([^)]*emit\(\s*'order'/s)
    expect(source, 'watching the array itself compares identity, which never settles')
      .not.toMatch(/watch\(\s*(?:sortedCards|orderedIds)\s*,[^)]*emit\(\s*'order'/s)
  })
})

/**
 * The shape-independent half. The grid's own walk is expressed over these — the
 * suite above exercises it through `nextCard`, which is what keeps the two shapes
 * from disagreeing about where the ends are.
 */
describe('walking a flat sequence', () => {
  const SEQ = [7, 3, 9, 1]

  it('steps forward and back', () => {
    expect(nextInSequence(SEQ, 3, 'next')).toBe(9)
    expect(nextInSequence(SEQ, 3, 'prev')).toBe(7)
  })

  it('stops at both ends rather than wrapping', () => {
    expect(nextInSequence(SEQ, 7, 'prev')).toBeNull()
    expect(nextInSequence(SEQ, 1, 'next')).toBeNull()
  })

  it('is reversible, unlike crossing a column', () => {
    const there = nextInSequence(SEQ, 3, 'next')!
    expect(nextInSequence(SEQ, there, 'prev')).toBe(3)
  })

  it('does nothing for a card outside the set', () => {
    // A filter can hide the open card. Stepping from somewhere that is not in the
    // list has no defined answer, so it has none.
    expect(nextInSequence(SEQ, 42, 'next')).toBeNull()
    expect(sequencePosition(SEQ, 42)).toBeNull()
  })

  it('reads the position one-based over the same ordering', () => {
    expect(sequencePosition(SEQ, 7)).toEqual({ index: 1, count: 4 })
    expect(sequencePosition(SEQ, 1)).toEqual({ index: 4, count: 4 })
  })

  it('is empty-safe', () => {
    expect(nextInSequence([], 1, 'next')).toBeNull()
    expect(sequencePosition([], 1)).toBeNull()
  })
})

/**
 * My Tasks: several tables, one walk. Each group is its own `ListView` with its
 * own sortable headers, so the sequence is assembled from what each reported.
 */
describe('one sequence across project groups', () => {
  const ORDER = new Map([
    ['alpha', [1, 2]],
    ['beta', [10]],
    ['gamma', [20, 21]]
  ])
  const GROUPS = ['alpha', 'beta', 'gamma']
  const none = () => false

  it('concatenates the groups in the order the page lists them', () => {
    expect(groupedSequence(GROUPS, ORDER, none)).toEqual([1, 2, 10, 20, 21])
  })

  it('crosses a project boundary like any other step', () => {
    // The panel's props follow the card rather than the group: the page resolves
    // the id through `findCard`, so stepping from beta into gamma swaps the
    // statuses, members and project key it is handed. That is the whole
    // mechanism, and it means the walk needs no notion of groups at all.
    const seq = groupedSequence(GROUPS, ORDER, none)
    expect(nextInSequence(seq, 10, 'next')).toBe(20)
    expect(nextInSequence(seq, 20, 'prev')).toBe(10)
    expect(sequencePosition(seq, 20)).toEqual({ index: 4, count: 5 })
  })

  it('skips a collapsed group', () => {
    // Its table is unmounted, so its last reported order is stale and its cards
    // are not on the page. Walking into them would open a card the user cannot
    // see behind the panel.
    const seq = groupedSequence(GROUPS, ORDER, id => id === 'beta')
    expect(seq).toEqual([1, 2, 20, 21])
    expect(nextInSequence(seq, 2, 'next')).toBe(20)
  })

  it('skips a group that has reported no order', () => {
    // Never rendered is not the same as rendered empty, and falling back to the
    // group's card array would be guessing at a sort nobody applied.
    expect(groupedSequence([...GROUPS, 'delta'], ORDER, none)).toEqual([1, 2, 10, 20, 21])
  })

  it('is empty when everything is collapsed', () => {
    expect(groupedSequence(GROUPS, ORDER, () => true)).toEqual([])
  })
})

/**
 * The board drags a *filtered* column and the server splices into the stored
 * one, so every case here is about a card the user could not see.
 *
 * Positions are indices into the target column with the moved card removed,
 * which is what `move.put.ts` builds before splicing and what `useKanban`'s
 * optimistic renumber assumes.
 */
describe('dropPosition', () => {
  // Stored order: 1 [2 hidden] 3 [4 hidden] 5
  const ALL = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]
  const VISIBLE = [{ id: 1 }, { id: 3 }, { id: 5 }]

  const drop = (visibleIndex: number, cardId = 99) =>
    dropPosition({ visible: VISIBLE, all: ALL, cardId, visibleIndex })

  it('lands directly after the card it was dropped under', () => {
    // Under visible card 3, which is stored at index 2 — not at index 1, which
    // is what the raw visible index would have said.
    expect(drop(2)).toBe(3)
  })

  it('keeps a hidden card between two visible ones on the hidden side', () => {
    // Dropped under card 1: card 2 is hidden between 1 and 3 and must stay above.
    expect(drop(1)).toBe(1)
  })

  it('anchors on the card below when dropped at the top', () => {
    expect(drop(0)).toBe(0)
  })

  it('appends when dropped past the last visible card', () => {
    expect(drop(VISIBLE.length)).toBe(ALL.length)
  })

  it('appends when nothing in the column is visible', () => {
    // A Done column whose cards are all past the retention window: there is no
    // neighbour to anchor to, and inserting at 0 would renumber cards the user
    // never saw.
    expect(dropPosition({ visible: [], all: ALL, cardId: 99, visibleIndex: 0 })).toBe(ALL.length)
  })

  it('ignores the moved card when it is already in this column', () => {
    // Same-column reorder: vuedraggable's index already assumes the card is out.
    const all = [{ id: 1 }, { id: 2 }, { id: 7 }, { id: 3 }]
    const visible = [{ id: 1 }, { id: 7 }, { id: 3 }]
    // Dropped under visible card 3, which sits at index 2 once 7 is removed.
    expect(dropPosition({ visible, all, cardId: 7, visibleIndex: 2 })).toBe(3)
  })

  it('is the identity when nothing is hidden', () => {
    // The property that makes this safe to apply unconditionally.
    for (let i = 0; i <= VISIBLE.length; i++) {
      expect(dropPosition({ visible: VISIBLE, all: VISIBLE, cardId: 99, visibleIndex: i })).toBe(i)
    }
  })
})
