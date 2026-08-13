// Project accent colours. User-facing only as a decorative tint per project, so
// a fixed hex ramp is fine here — it is rendered through the `.swatch` classes
// in main.css, which derive a readable foreground and fill for the active theme.
export const ACCENT_COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#06b6d4']

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
