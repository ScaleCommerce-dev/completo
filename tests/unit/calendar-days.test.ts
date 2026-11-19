import { describe, it, expect, afterEach } from 'vitest'
import { addDays, calendarDays, cardDay, cardsByDay, isDayKey, localDay, periodTitle, shiftAnchor, weekStart } from '../../app/utils/calendar-days'

const stored = (day: string) => `${day}T00:00:00.000Z`

describe('time zones', () => {
  const original = process.env.TZ
  afterEach(() => {
    process.env.TZ = original
  })

  it('reads a stored due date as its calendar day in any time zone', () => {
    // Midnight UTC is the evening before in New York and morning in Tokyo.
    for (const tz of ['America/New_York', 'Europe/Berlin', 'Asia/Tokyo', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz
      expect(cardDay(stored('2026-11-23'))).toBe('2026-11-23')
    }
  })

  it('takes today from the viewer\'s clock, not from UTC', () => {
    process.env.TZ = 'Europe/Berlin'
    // 23:30 UTC on the 22nd is already 00:30 on the 23rd in Berlin.
    expect(localDay(new Date('2026-11-22T23:30:00Z'))).toBe('2026-11-23')
    process.env.TZ = 'America/Los_Angeles'
    // 05:00 UTC on the 23rd is still the evening of the 22nd in Los Angeles.
    expect(localDay(new Date('2026-11-23T05:00:00Z'))).toBe('2026-11-22')
  })

  it('steps over the clock change by calendar day', () => {
    process.env.TZ = 'Europe/Berlin'
    // 25 October 2026 has 25 hours in Berlin.
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25')
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26')
    expect(calendarDays('week', '2026-10-25').map(d => d.key)).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
  })
})

describe('weeks', () => {
  it('start on Monday', () => {
    expect(weekStart('2026-11-23')).toBe('2026-11-23')
    expect(weekStart('2026-11-29')).toBe('2026-11-23')
    expect(weekStart('2026-11-30')).toBe('2026-11-30')
  })

  it('show seven labelled days with the weekend marked', () => {
    const days = calendarDays('week', '2026-11-25')
    expect(days.map(d => d.label)).toEqual(['Mon 23', 'Tue 24', 'Wed 25', 'Thu 26', 'Fri 27', 'Sat 28', 'Sun 29'])
    expect(days.filter(d => d.isWeekend).map(d => d.key)).toEqual(['2026-11-28', '2026-11-29'])
    expect(days.every(d => d.inPeriod)).toBe(true)
  })

  it('step by seven days and name their span, across months and years', () => {
    expect(shiftAnchor('week', '2026-11-25', 1)).toBe('2026-11-30')
    expect(shiftAnchor('week', '2026-11-25', -1)).toBe('2026-11-16')
    expect(periodTitle('week', '2026-11-25')).toBe('Nov 23 to 29, 2026')
    expect(periodTitle('week', '2026-12-01')).toBe('Nov 30 to Dec 6, 2026')
    expect(periodTitle('week', '2026-12-30')).toBe('Dec 28, 2026 to Jan 3, 2027')
  })
})

describe('months', () => {
  it('cover the month in whole weeks, and mark the days outside it', () => {
    const days = calendarDays('month', '2026-11-18')
    // November 2026 starts on a Sunday: the grid opens on Monday 26 October.
    expect(days[0]!.key).toBe('2026-10-26')
    expect(days.at(-1)!.key).toBe('2026-12-06')
    expect(days).toHaveLength(42)
    expect(days.filter(d => d.inPeriod)).toHaveLength(30)
  })

  it('take five weeks when that is enough', () => {
    expect(calendarDays('month', '2027-02-10')).toHaveLength(28)
    expect(calendarDays('month', '2026-12-10')).toHaveLength(35)
  })

  it('step by month, from any day in it, and are named in full', () => {
    expect(shiftAnchor('month', '2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftAnchor('month', '2026-01-31', -1)).toBe('2025-12-01')
    expect(periodTitle('month', '2026-11-18')).toBe('November 2026')
  })
})

describe('cards by day', () => {
  it('groups cards by due date and skips those without one', () => {
    const byDay = cardsByDay([
      { id: 3, dueDate: stored('2026-11-24') },
      { id: 1, dueDate: stored('2026-11-24') },
      { id: 2, dueDate: null }
    ])
    expect([...byDay.keys()]).toEqual(['2026-11-24'])
    expect(byDay.get('2026-11-24')!.map(c => c.id)).toEqual([1, 3])
  })

  it('accepts only real calendar days in the address', () => {
    expect(isDayKey('2026-11-23')).toBe(true)
    expect(isDayKey('2026-02-30')).toBe(false)
    expect(isDayKey('23.11.2026')).toBe(false)
  })
})
