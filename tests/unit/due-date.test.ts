import { describe, it, expect, vi, afterEach } from 'vitest'
import { getDueDateStatus, dueDateColor, dueDateIcon } from '../../app/utils/constants'
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

describe('dueDateColor', () => {
  it('returns red for overdue', () => {
    expect(dueDateColor('overdue')).toBe('#ef4444')
  })

  it('returns orange for due-soon', () => {
    expect(dueDateColor('due-soon')).toBe('#f97316')
  })

  it('returns slate for future', () => {
    expect(dueDateColor('future')).toBe('#64748b')
  })

  it('returns slate for null', () => {
    expect(dueDateColor(null)).toBe('#64748b')
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
