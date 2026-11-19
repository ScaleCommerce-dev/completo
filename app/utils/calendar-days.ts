/**
 * The Calendar page's days: which ones a week or month shows, how they are
 * labelled, and which day a card falls on. Pure, so the rules, time zones above
 * all, are unit-tested (`tests/unit/calendar-days.test.ts`).
 *
 * Two kinds of "day" meet here, and keeping them apart is the whole trick:
 *
 * - **A card's day is its stored calendar date.** A picked due date is stored
 *   as midnight UTC of that day (`DueDatePicker`), so it is read back in UTC.
 *   Read in local time, "due 23 Nov" became the 22nd for anyone west of
 *   Greenwich, and would for anyone east of it if it were stored as local midnight.
 * - **Today is the viewer's local date.** At 00:30 in Berlin it is already the
 *   next day there, while UTC still says the previous one.
 *
 * Both are compared as `YYYY-MM-DD` keys, so neither passes through a time-zone
 * conversion again. Weeks start on Monday.
 */
import type { CalendarMode } from '#shared/utils/calendar-filter'

export interface CalendarDay {
  /** `YYYY-MM-DD` */
  key: string
  /** 0 Sunday … 6 Saturday */
  weekday: number
  dayOfMonth: number
  /** "Mon 23" */
  label: string
  isWeekend: boolean
  /** In the month a month view is showing; always true in a week view. */
  inPeriod: boolean
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const pad = (n: number) => String(n).padStart(2, '0')

const parts = (key: string) => key.split('-').map(Number) as [number, number, number]
const utc = (key: string) => new Date(`${key}T00:00:00Z`)

/** A stored card date as its calendar day, read in UTC (see above). */
export function cardDay(value: string | null | undefined): string | null {
  if (!value) return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** The viewer's own calendar day. */
export function localDay(now = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** A day key `n` days later (or earlier), by calendar, so a clock change cannot skip one. */
export function addDays(key: string, n: number): string {
  const [y, m, d] = parts(key)
  return cardDay(new Date(Date.UTC(y, m - 1, d + n)).toISOString())!
}

export function isDayKey(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && cardDay(`${value}T00:00:00Z`) === value
}

/** The Monday of the week a day is in. */
export function weekStart(key: string): string {
  return addDays(key, -((utc(key).getUTCDay() + 6) % 7))
}

/** The first and last day of the month a day is in. */
function monthBounds(key: string): { first: string, last: string } {
  const [y, m] = parts(key)
  const first = `${y}-${pad(m)}-01`
  const last = cardDay(new Date(Date.UTC(y, m, 0)).toISOString())!
  return { first, last }
}

/**
 * The days a view shows around `anchor`: the week it is in, or the whole weeks
 * that cover its month (five or six of them), Monday first.
 */
export function calendarDays(mode: CalendarMode, anchor: string): CalendarDay[] {
  const { first, last } = monthBounds(anchor)
  const start = mode === 'week' ? weekStart(anchor) : weekStart(first)
  const end = mode === 'week' ? addDays(start, 6) : addDays(weekStart(last), 6)
  const days: CalendarDay[] = []
  for (let key = start; key <= end; key = addDays(key, 1)) {
    const weekday = utc(key).getUTCDay()
    const dayOfMonth = parts(key)[2]
    days.push({
      key,
      weekday,
      dayOfMonth,
      label: `${WEEKDAYS[weekday]} ${dayOfMonth}`,
      isWeekend: weekday === 0 || weekday === 6,
      inPeriod: mode === 'week' || (key >= first && key <= last)
    })
  }
  return days
}

/** The anchor one week or month earlier (`-1`) or later (`1`). */
export function shiftAnchor(mode: CalendarMode, anchor: string, step: -1 | 1): string {
  if (mode === 'week') return addDays(weekStart(anchor), 7 * step)
  const [y, m] = parts(anchor)
  return cardDay(new Date(Date.UTC(y, m - 1 + step, 1)).toISOString())!
}

/**
 * The month and year on screen: "November 2026", or for a week across two,
 * "Nov to Dec 2026" and "Dec 2026 to Jan 2027". UI copy has no en dashes.
 *
 * No days: the grid already names every one ("Mon 23"), so a span of days here
 * said it twice, as Apple Calendar does not. The month and year stay, because
 * the grid shows neither.
 */
export function periodTitle(mode: CalendarMode, anchor: string): string {
  if (mode === 'month') {
    const [y, m] = parts(anchor)
    return `${MONTHS_LONG[m - 1]} ${y}`
  }
  const [sy, sm] = parts(weekStart(anchor))
  const [ey, em] = parts(addDays(weekStart(anchor), 6))
  if (sy !== ey) return `${MONTHS[sm - 1]} ${sy} to ${MONTHS[em - 1]} ${ey}`
  if (sm !== em) return `${MONTHS[sm - 1]} to ${MONTHS[em - 1]} ${ey}`
  return `${MONTHS_LONG[sm - 1]} ${sy}`
}

/** Cards by the day they are due, each day earliest-created first. */
export function cardsByDay<T extends { id: number, dueDate?: string | null }>(cards: T[]): Map<string, T[]> {
  const byDay = new Map<string, T[]>()
  for (const card of [...cards].sort((a, b) => a.id - b.id)) {
    const day = cardDay(card.dueDate)
    if (!day) continue
    const list = byDay.get(day)
    if (list) list.push(card)
    else byDay.set(day, [card])
  }
  return byDay
}
