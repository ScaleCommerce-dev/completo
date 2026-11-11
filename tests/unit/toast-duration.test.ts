import { describe, it, expect } from 'vitest'
import { toastDuration } from '../../app/utils/toast-duration'

// Handoff `05-interaktion.md` › Rückmeldungen.
describe('toastDuration', () => {
  it('gives a short confirmation at least 5s', () => {
    expect(toastDuration({ id: 1, title: 'Saved.' })).toBe(5_000)
  })

  it('gives a message over 90 characters or several lines at least 10s', () => {
    expect(toastDuration({ id: 1, title: 'x'.repeat(91) })).toBe(10_000)
    expect(toastDuration({ id: 1, title: 'Done', description: 'line one\nline two' })).toBe(10_000)
  })

  it('gives longer text 2.5s plus 300ms a word', () => {
    const words = Array.from({ length: 40 }, () => 'word').join(' ')
    expect(toastDuration({ id: 1, description: words })).toBe(2_500 + 300 * 40)
  })

  it('keeps errors and anything with an action until closed', () => {
    expect(toastDuration({ id: 1, title: 'Failed', color: 'error' })).toBe(Number.POSITIVE_INFINITY)
    expect(toastDuration({ id: 1, title: 'Undo?', actions: [{}] })).toBe(Number.POSITIVE_INFINITY)
  })
})
