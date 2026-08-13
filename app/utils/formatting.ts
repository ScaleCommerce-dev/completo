export function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 0) return 'just now'
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.floor(days / 365)
  return years === 1 ? '1y ago' : `${years}y ago`
}

export function formatTicketId(projectKey: string | undefined, id: number): string {
  return `${projectKey || 'TK'}-${id}`
}

export function formatTicketUrl(projectSlug: string | undefined, projectKey: string | undefined, id: number): string {
  const path = `/projects/${projectSlug}/cards/${formatTicketId(projectKey, id)}`
  if (import.meta.client) return `${window.location.origin}${path}`
  return path
}

export function formatDueDate(dueDate: string | Date): string {
  const d = new Date(dueDate)
  const now = new Date()
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric'
  return d.toLocaleDateString('en-US', opts)
}

/**
 * A count with its noun, pluralised. `pluralize(1, 'board')` → "1 board".
 *
 * For stat rows that used to be a bare number behind an icon — "12  1  6" on a project
 * card, "12" on a view card. A reader who doesn't already know the icon vocabulary can't
 * recover which number is which, and there is nothing to hover. Irregular plurals take
 * the second argument: `pluralize(n, 'person', 'people')`.
 */
export function pluralize(count: number, singular: string, plural?: string): string {
  return `${count} ${count === 1 ? singular : (plural ?? `${singular}s`)}`
}
