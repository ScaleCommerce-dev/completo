import { describe, it, expect } from 'vitest'
import { generateSlug } from '../../server/utils/generate-slug'

describe('generateSlug', () => {
  it('lowercases and hyphenates', () => {
    expect(generateSlug('My Board')).toBe('my-board')
  })

  it('replaces multiple non-alphanumeric chars with single hyphen', () => {
    expect(generateSlug('Hello   World!!!')).toBe('hello-world')
  })

  it('strips leading and trailing hyphens', () => {
    expect(generateSlug('--hello--')).toBe('hello')
    expect(generateSlug('  hello  ')).toBe('hello')
  })

  it('handles special characters', () => {
    expect(generateSlug('Sprint Board #1')).toBe('sprint-board-1')
  })

  it('preserves numbers', () => {
    expect(generateSlug('v2 Release')).toBe('v2-release')
  })

  it('handles empty string', () => {
    expect(generateSlug('')).toBe('')
  })

  it('collapses multiple special chars to single hyphen', () => {
    expect(generateSlug('a---b___c')).toBe('a-b-c')
  })
})
