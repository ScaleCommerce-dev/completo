/**
 * Where a field menu opens.
 *
 * Every menu that edits a card field — status, priority, assignee, tags, and the
 * due-date calendar — reads from this. It used to be written out at each call
 * site, four keys at a time, and the values had drifted: the board passed
 * `align: 'end'`, the list and the card panel passed `align: 'start'`, and the
 * card panel omitted `collisionPadding` entirely, so its menus could sit flush
 * against the window edge while everything else kept 8px.
 *
 * The contract is: **below the control, 4px down, never closer than 8px to the
 * edge of the screen.** Only the alignment axis is a call-site decision, because
 * it depends on how the controls are anchored — see `FIELD_MENU_ALIGN_*` below.
 */
export const FIELD_MENU_PLACEMENT = {
  side: 'bottom',
  sideOffset: 4,
  collisionPadding: 8
} as const

/**
 * A menu lines up with the edge its control is anchored to.
 *
 * In a table the controls are cells: their left edges are a column, identical on
 * every row, so `start` puts every menu in that same column. On a board card the
 * four controls are a cluster pinned to the card's right edge, so `end` is what
 * keeps the menu over the card instead of spilling into the next column — but
 * `end` alone aligns to the *button*, and the buttons move: a card carrying a
 * due date renders "Aug 20" instead of a 24px icon, which pushes its neighbours
 * 36px left. Same field, two cards, two positions. `KanbanCard` therefore also
 * passes an `alignOffset` measured from the cluster, so all four menus land
 * flush with the card's content edge on every card.
 */
export const FIELD_MENU_ALIGN_START = { ...FIELD_MENU_PLACEMENT, align: 'start' } as const
export const FIELD_MENU_ALIGN_END = { ...FIELD_MENU_PLACEMENT, align: 'end' } as const

/**
 * Where a card preview opens: **beside** the thing it previews, not below it.
 *
 * Not a field menu, so not `FIELD_MENU_PLACEMENT`. A field menu opens below its
 * control because the control is where the eye already is and the menu is the
 * next step. A preview is read *instead of* the chip, and on the Calendar below
 * a chip is the rest of the same day: opening there covered exactly the cards
 * the reader was comparing it with. To the side it covers the neighbouring day
 * at most, and `start` keeps its top line level with the chip's.
 */
export const CARD_PREVIEW_PLACEMENT = {
  side: 'right',
  align: 'start',
  sideOffset: 8,
  collisionPadding: 12
} as const
