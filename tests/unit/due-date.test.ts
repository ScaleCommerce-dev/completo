import { describe, it, expect, vi, afterEach } from 'vitest'
import { getDueDateStatus, dueDateTextClass, dueDateIcon } from '../../app/utils/constants'
import { formatDueDate } from '../../app/utils/formatting'

describe('getDueDateStatus', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns null for null/undefined', () => {
    expect(getDueDateStatus(null)).toBeNull()
    expect(getDueDateStatus(undefined)).toBeNull()
  })

  it('returns overdue for past dates', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    expect(getDueDateStatus('2026-03-13')).toBe('overdue')
    expect(getDueDateStatus('2026-01-01')).toBe('overdue')
  })

  it('returns due-soon for today', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    expect(getDueDateStatus('2026-03-15')).toBe('due-soon')
  })

  it('returns due-soon for tomorrow', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    expect(getDueDateStatus('2026-03-16')).toBe('due-soon')
  })

  it('returns future for dates beyond tomorrow', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-15T12:00:00'))
    expect(getDueDateStatus('2026-03-17')).toBe('future')
    expect(getDueDateStatus('2026-12-31')).toBe('future')
  })
})

// Due-date urgency returns semantic classes rather than hex. The previous hex
// values were single-valued across both themes, and `future`'s #64748b measured
// roughly 2.3:1 on a dark card — under AA. Tokens follow the colour mode.
describe('dueDateTextClass', () => {
  it('returns the error token for overdue', () => {
    expect(dueDateTextClass('overdue')).toBe('text-error')
  })

  it('returns the warning token for due-soon', () => {
    expect(dueDateTextClass('due-soon')).toBe('text-warning')
  })

  it('returns a neutral token for future', () => {
    expect(dueDateTextClass('future')).toBe('text-muted')
  })

  it('returns a neutral token for null', () => {
    expect(dueDateTextClass(null)).toBe('text-muted')
  })
})

describe('dueDateIcon', () => {
  it('returns calendar-x for overdue', () => {
    expect(dueDateIcon('overdue')).toBe('i-lucide-calendar-x')
  })

  it('returns calendar-clock for due-soon', () => {
    expect(dueDateIcon('due-soon')).toBe('i-lucide-calendar-clock')
  })

  it('returns calendar for future', () => {
    expect(dueDateIcon('future')).toBe('i-lucide-calendar')
  })
})

describe('formatDueDate', () => {
  it('formats a date string', () => {
    const result = formatDueDate('2026-03-15')
    expect(result).toContain('Mar')
    expect(result).toContain('15')
  })
})
