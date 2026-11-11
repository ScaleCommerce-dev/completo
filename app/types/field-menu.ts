/**
 * One option in a field menu — see `FieldMenu.vue`.
 *
 * Exactly one of `swatch` / `icon` / `avatar` carries the option's mark. They all
 * render into the same 16px box, which is what keeps a status dot, a priority
 * glyph and a member's face on the same left edge across all four menus.
 */
export interface FieldMenuOption {
  label: string
  checked: boolean
  /** User-chosen hex. Goes through `UiStatusDot`, never applied raw. */
  swatch?: string | null
  /** Renders the done check instead of a dot. */
  done?: boolean
  icon?: string
  /** Semantic text class for the icon — e.g. priority's colour. */
  iconClass?: string
  /** A person's face, or an agent's square: `kind` and `color` go to `UiAvatar`. */
  avatar?: { src?: string, alt?: string, kind?: 'human' | 'agent', color?: string | null }
  onSelect: () => void
}

/**
 * A labelled run of options. The assignee menu has three (People, Your agents,
 * Other agents) and the rest have one, unlabelled.
 */
export interface FieldMenuSection {
  label?: string
  /** A count beside the label, for a group that shows only part of itself. */
  count?: number
  options: FieldMenuOption[]
  /** A quiet closing line, such as "12 more, type to search". */
  note?: string
}
