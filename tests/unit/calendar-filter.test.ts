import { describe, it, expect } from 'vitest'
import { EMPTY_FILTERS, matchesCalendar, UNASSIGNED } from '../../shared/utils/calendar-filter'

const card = { projectId: 'p1', assigneeId: 'u1', tags: [{ name: 'Redaktionsplan' }, { name: 'LinkedIn' }] }

describe('matchesCalendar', () => {
  it('lets everything through with no filter set', () => {
    expect(matchesCalendar(card, 'To Do', EMPTY_FILTERS)).toBe(true)
  })

  it('matches tags and statuses by name, ignoring case and spaces', () => {
    expect(matchesCalendar(card, 'To Do', { ...EMPTY_FILTERS, tags: [' redaktionsplan '] })).toBe(true)
    expect(matchesCalendar(card, 'To Do', { ...EMPTY_FILTERS, tags: ['Newsletter'] })).toBe(false)
    expect(matchesCalendar(card, 'In Progress', { ...EMPTY_FILTERS, statuses: ['in progress'] })).toBe(true)
    expect(matchesCalendar(card, 'To Do', { ...EMPTY_FILTERS, statuses: ['Done'] })).toBe(false)
  })

  it('takes any of several values within a filter, and needs every filter that is set', () => {
    expect(matchesCalendar(card, 'To Do', { ...EMPTY_FILTERS, tags: ['Newsletter', 'LinkedIn'] })).toBe(true)
    expect(matchesCalendar(card, 'To Do', { ...EMPTY_FILTERS, tags: ['LinkedIn'], projects: ['p2'] })).toBe(false)
  })

  it('filters by person, with a choice for cards nobody is assigned to', () => {
    expect(matchesCalendar(card, 'To Do', { ...EMPTY_FILTERS, people: ['u1'] })).toBe(true)
    expect(matchesCalendar({ ...card, assigneeId: null }, 'To Do', { ...EMPTY_FILTERS, people: [UNASSIGNED] })).toBe(true)
    expect(matchesCalendar({ ...card, assigneeId: null }, 'To Do', { ...EMPTY_FILTERS, people: ['u1'] })).toBe(false)
  })
})
