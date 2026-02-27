export const ACCENT_COLORS = ['#6366f1', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#ec4899', '#06b6d4']

export const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#78716c', '#b45309', '#15803d', '#0e7490',
  '#4338ca', '#7e22ce', '#be185d', '#334155'
]

export const PRIORITIES = [
  { value: 'low', label: 'Low', icon: 'i-lucide-chevron-down', color: '#94a3b8' },
  { value: 'medium', label: 'Medium', icon: 'i-lucide-grip-horizontal', color: '#6366f1' },
  { value: 'high', label: 'High', icon: 'i-lucide-chevron-up', color: '#f97316' },
  { value: 'urgent', label: 'Urgent', icon: 'i-lucide-alert-circle', color: '#ef4444' }
] as const

export const PRIORITY_COLOR_MAP: Record<string, string> = Object.fromEntries(
  PRIORITIES.map(p => [p.value, p.color])
)

export function priorityColor(priority: string): string {
  return PRIORITY_COLOR_MAP[priority] || '#94a3b8'
}

export function priorityIcon(priority: string): string {
  return PRIORITIES.find(p => p.value === priority)?.icon || 'i-lucide-equal'
}

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

export function dueDateColor(status: DueDateStatus | null): string {
  switch (status) {
    case 'overdue': return '#ef4444'
    case 'due-soon': return '#f97316'
    default: return '#64748b'
  }
}

export function dueDateIcon(status: DueDateStatus | null): string {
  switch (status) {
    case 'overdue': return 'i-lucide-calendar-x'
    case 'due-soon': return 'i-lucide-calendar-clock'
    default: return 'i-lucide-calendar'
  }
}
