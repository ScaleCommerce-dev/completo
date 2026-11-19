import { describe, it, expect } from 'vitest'
import { DONE_STATUS, EMPTY_FILTERS, matchesCalendar, UNASSIGNED } from '../../shared/utils/calendar-filter'

const card = { projectId: 'p1', assigneeId: 'u1', tags: [{ name: 'Redaktionsplan' }, { name: 'LinkedIn' }] }
const open = (name: string) => ({ name, isDone: false })
const done = (name: string) => ({ name, isDone: true })

describe('matchesCalendar', () => {
  it('lets everything through with no filter set', () => {
    expect(matchesCalendar(card, open('To Do'), EMPTY_FILTERS)).toBe(true)
  })

  it('matches tags and statuses by name, ignoring case and spaces', () => {
    expect(matchesCalendar(card, open('To Do'), { ...EMPTY_FILTERS, tags: [' redaktionsplan '] })).toBe(true)
    expect(matchesCalendar(card, open('To Do'), { ...EMPTY_FILTERS, tags: ['Newsletter'] })).toBe(false)
    expect(matchesCalendar(card, open('In Progress'), { ...EMPTY_FILTERS, statuses: ['in progress'] })).toBe(true)
    expect(matchesCalendar(card, open('To Do'), { ...EMPTY_FILTERS, statuses: ['Done'] })).toBe(false)
  })

  it('takes any of several values within a filter, and needs every filter that is set', () => {
    expect(matchesCalendar(card, open('To Do'), { ...EMPTY_FILTERS, tags: ['Newsletter', 'LinkedIn'] })).toBe(true)
    expect(matchesCalendar(card, open('To Do'), { ...EMPTY_FILTERS, tags: ['LinkedIn'], projects: ['p2'] })).toBe(false)
  })

  it('filters by person, with a choice for cards nobody is assigned to', () => {
    expect(matchesCalendar(card, open('To Do'), { ...EMPTY_FILTERS, people: ['u1'] })).toBe(true)
    expect(matchesCalendar({ ...card, assigneeId: null }, open('To Do'), { ...EMPTY_FILTERS, people: [UNASSIGNED] })).toBe(true)
    expect(matchesCalendar({ ...card, assigneeId: null }, open('To Do'), { ...EMPTY_FILTERS, people: ['u1'] })).toBe(false)
  })

  it('reads Done as each project\'s done status, whatever it is called', () => {
    const onlyDone = { ...EMPTY_FILTERS, statuses: [DONE_STATUS] }
    expect(matchesCalendar(card, done('Done'), onlyDone)).toBe(true)
    expect(matchesCalendar(card, done('Erledigt'), onlyDone)).toBe(true)
    expect(matchesCalendar(card, open('Done'), onlyDone)).toBe(false)
    expect(matchesCalendar(card, open('In Progress'), onlyDone)).toBe(false)
  })

  it('combines Done with status names', () => {
    const doneOrReview = { ...EMPTY_FILTERS, statuses: [DONE_STATUS, 'Review'] }
    expect(matchesCalendar(card, done('Erledigt'), doneOrReview)).toBe(true)
    expect(matchesCalendar(card, open('review'), doneOrReview)).toBe(true)
    expect(matchesCalendar(card, open('To Do'), doneOrReview)).toBe(false)
  })
})
