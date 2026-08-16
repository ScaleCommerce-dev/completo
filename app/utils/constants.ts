// Project accent colours — a decorative tint per project, so a fixed hex ramp is
// fine as the *source*.
//
// This said the ramp "is rendered through the `.swatch` classes", which is what
// it should do and not what it does: all six call sites build inline styles from
// the raw hex instead (`projects/index.vue`, `projects/[slug]/index.vue`,
// `ProfileActivity.vue`), and the alpha suffix has already drifted between them
// — `+'14'` in two files, `+'12'` in the third. That is the bug the swatch
// recipe was written to end, reintroduced by hand: a raw hex on a wash of its
// own hue measures ~2.2:1 for the amber entry, and mixing cannot fix it because
// the fix is to *set* the lightness (see the `.swatch` block in main.css).
//
// `.swatch-bar` exists for exactly the border-left-plus-tint shape those sites
// hand-roll, and currently has zero call sites. Migrating them is owed; until
// then this comment describes the destination, not the present.
export const ACCENT_COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#06b6d4']

// ─── Identity ───────────────────────────────────────────────────────────────
//
// A person's avatar colour, derived from their name rather than stored. It is
// rendered through `.swatch-avatar`, so a tinted disc with saturated initials
// works on white and on near-black without a second rule and without any
// colour-mode logic in JS.
//
// It exists because a screen with several people on it showed several identical
// grey `bg-elevated` discs: on TK-21 nine comments drew nine of them, four
// reading "DA". That is about *identity* and nothing else — the thread's
// structure is the inset rule between records (see `CommentList`), not this.
// Repetition is information here: four discs of one colour say "the same person,
// four times" at a glance.
//
// Not `ACCENT_COLORS`: those are *offered* to a user for a project tint, so the
// set is small and its ordering is a picker's, while these are *derived* and want
// hues spaced far enough apart to survive being reduced to a 24px disc.
//
// **No hue within 15° of `--ui-error`,** which is `oklch(70.4% 0.191 22.216)` —
// stated as a measured band rather than as "no red", because the vaguer version
// was both unenforceable and false. It shipped alongside a test asserting
// `not.toContain('#ef4444')`, a hex that had never been in this list, while
// `#f43f5e` sat in it at hue 16° — **6.2° from the error colour**. A confident
// claim with a guard that could not fail is worse than no claim, so the guard now
// computes hue angles and would have caught it. Amber survives the band at 47.8°
// from error and 21.9° from `--ui-warning`; a filled disc of initials does not
// resemble a status dot, so the band only has to cover the one collision that is
// actually close.
//
// Thirteen, and the count is a consequence rather than a target: excluding the
// error band costs a hue and the remaining gap between amber and green is not
// wide enough for two more without them reading alike. Collisions are the cost
// and the count is the only lever on them, but it was never going to be enough to
// make the colour an *identifier* — five people in one thread collide about half
// the time at any palette size worth looking at, which is why the disc still
// carries initials. What it does buy is the case with no other signal at all:
// `Lola3`/`Lola4`/`Lola6` all render as one letter, so the hue is the only thing
// separating three commenters, and FNV-1a's avalanche keeps one-character
// neighbours apart.
export const IDENTITY_COLORS = [
  '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#14b8a6', '#10b981', '#22c55e',
  '#f59e0b', '#f97316', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6'
]

/**
 * Stable colour for a person. FNV-1a over the display name — one pass, no
 * allocation, and the same answer in every view, which is what makes the colour
 * readable as identity rather than as decoration.
 *
 * Keyed on the name and not the id on purpose: the id is absent at half the
 * call sites (mention lists, member avatars, the session user), and the name is
 * what the reader is matching the disc against anyway.
 */
export function identityColor(name: string | null | undefined): string {
  if (!name) return IDENTITY_COLORS[0]!

  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return IDENTITY_COLORS[(h >>> 0) % IDENTITY_COLORS.length]!
}

// Offered to users when picking a status or tag colour.
export const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#78716c', '#b45309', '#15803d', '#0e7490',
  '#4338ca', '#7e22ce', '#be185d', '#334155'
]

// ─── Priority ───────────────────────────────────────────────────────────────
//
// Priority is app-defined, not user data, so it is expressed as semantic classes
// rather than hex. That fixes two things at once: the colours now follow the
// theme (the old `#94a3b8` low-priority hex measured ~2.3:1 on a dark card, well
// under AA), and priority stops competing with the brand — `medium` used to be
// indigo, which on a board where most cards are medium meant the accent colour
// was carrying no information at all.
//
// Only high and urgent earn colour. Low and medium are deliberately neutral: on
// a board the question is "what needs attention", and 9 identical indigo
// "medium" rows answer it with noise.
//
// The `medium` icon was `i-lucide-grip-horizontal` — six dots, which on a
// draggable card reads unmistakably as a drag handle. `equal` says "middle".
export const PRIORITIES = [
  { value: 'low', label: 'Low', icon: 'i-lucide-chevron-down' },
  { value: 'medium', label: 'Medium', icon: 'i-lucide-equal' },
  { value: 'high', label: 'High', icon: 'i-lucide-chevron-up' },
  { value: 'urgent', label: 'Urgent', icon: 'i-lucide-alert-circle' }
] as const

export type Priority = typeof PRIORITIES[number]['value']

const PRIORITY_TEXT: Record<string, string> = {
  low: 'text-dimmed',
  medium: 'text-muted',
  high: 'text-warning',
  urgent: 'text-error'
}

// Edge bar on kanban cards and list rows. Empty for low/medium — the caller
// renders no bar at all rather than a neutral one, so an unremarkable card
// carries no marks.
const PRIORITY_BAR: Record<string, string> = {
  low: '',
  medium: '',
  high: 'bg-warning',
  urgent: 'bg-error'
}

// Data-visualisation fills (ProfileActivity's stacked bar), where all four
// levels must be distinguishable from each other rather than by urgency.
const PRIORITY_CHART: Record<string, string> = {
  low: 'bg-accented',
  medium: 'bg-primary/60',
  high: 'bg-warning',
  urgent: 'bg-error'
}

/** Semantic text colour for a priority icon or label. */
export function priorityTextClass(priority: string): string {
  return PRIORITY_TEXT[priority] || 'text-dimmed'
}

/** Edge-bar fill. Empty string means "draw no bar". */
export function priorityBarClass(priority: string): string {
  return PRIORITY_BAR[priority] ?? ''
}

/**
 * Whether this priority has earned ink on a resting scan surface.
 *
 * Only high and urgent have. On a board where most cards are medium, a medium
 * marker on every card carries no information — it just costs a row of "= Medium"
 * down the list and an icon on every card. The control stays reachable: board
 * cards and list cells reveal it on hover, and it is always present wherever a
 * card is actually being edited.
 */
export function isSignalPriority(priority: string): boolean {
  return !!priorityBarClass(priority)
}

/** Distinguishable fill for charts. */
export function priorityChartClass(priority: string): string {
  return PRIORITY_CHART[priority] || 'bg-accented'
}

export function priorityLabel(priority: string): string {
  return PRIORITIES.find(p => p.value === priority)?.label || priority
}

export function priorityIcon(priority: string): string {
  return PRIORITIES.find(p => p.value === priority)?.icon || 'i-lucide-equal'
}

/**
 * Priority colour for a UButton/UDropdownMenu `color` prop. Mirrors
 * `priorityTextClass` in Nuxt UI's vocabulary — this used to be declared
 * independently in KanbanCard, CardModal and the card detail page.
 */
export function priorityUiColor(priority: string): 'error' | 'warning' | 'neutral' {
  if (priority === 'urgent') return 'error'
  if (priority === 'high') return 'warning'
  return 'neutral'
}

/**
 * An absent value in a list column.
 *
 * These cells are editable popover triggers, so removing the em-dash entirely would
 * leave an invisible button — there'd be no way to discover that clicking an empty Due
 * Date cell sets one. But ten rows of em-dash down a column reads as "this field is
 * unused", which is noise about data that isn't there. So the dash waits for the row:
 * the column is clean at rest and the hit target announces itself on hover or focus.
 *
 * Requires the row to carry `group` (`ListView`'s `tr` does). On touch there is no hover
 * to wait for, so `max-sm:` shows the dash at 60% rather than hiding an editable cell
 * behind an interaction the device cannot perform.
 */
export const EMPTY_CELL_CLASS = 'text-dimmed text-sm opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60 group-focus-within:opacity-100 transition-opacity'

// ─── Due dates ──────────────────────────────────────────────────────────────

export type DueDateStatus = 'overdue' | 'due-soon' | 'future'

export function getDueDateStatus(dueDate: string | Date | null | undefined): DueDateStatus | null {
  if (!dueDate) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrow = new Date(today.getTime() + 86400000)
  const due = new Date(dueDate)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())

  if (dueDay < today) return 'overdue'
  if (dueDay <= tomorrow) return 'due-soon'
  return 'future'
}

export function dueDateTextClass(status: DueDateStatus | null): string {
  switch (status) {
    case 'overdue': return 'text-error'
    case 'due-soon': return 'text-warning'
    default: return 'text-muted'
  }
}

export function dueDateIcon(status: DueDateStatus | null): string {
  switch (status) {
    case 'overdue': return 'i-lucide-calendar-x'
    case 'due-soon': return 'i-lucide-calendar-clock'
    default: return 'i-lucide-calendar'
  }
}
