/**
 * One option in a field menu — see `FieldMenu.vue`.
 *
 * Exactly one of `swatch` / `icon` / `avatar` carries the option's mark. They all
 * render into the same 16px box, which is what keeps a status dot, a priority
 * glyph and a member's face on the same left edge across all four menus.
 */
export interface FieldMenuOption {
  key: string
  label: string
  checked: boolean
  /** User-chosen hex. Goes through `UiStatusDot`, never applied raw. */
  swatch?: string | null
  /** Renders the done check instead of a dot. */
  done?: boolean
  icon?: string
  /** Semantic text class for the icon — e.g. priority's colour. */
  iconClass?: string
  avatar?: { src?: string, alt?: string }
  onSelect: () => void
}
