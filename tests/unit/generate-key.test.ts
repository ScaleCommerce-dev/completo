import { describe, it, expect } from 'vitest'
import { generateKey } from '../../server/utils/generate-key'

describe('generateKey', () => {
  it('takes first letter of each word', () => {
    expect(generateKey('My Project')).toBe('MP')
  })

  it('uppercases the result', () => {
    expect(generateKey('hello world')).toBe('HW')
  })

  it('truncates to 5 characters', () => {
    expect(generateKey('Alpha Beta Charlie Delta Echo Foxtrot')).toBe('ABCDE')
  })

  it('handles single word with at least 2 chars', () => {
    expect(generateKey('Engineering')).toBe('ENG')
    expect(generateKey('Go')).toBe('GO')
    expect(generateKey('X')).toBe('PR')
  })

  it('strips non-letter characters from initials', () => {
    expect(generateKey('123 456')).toBe('PR')
  })

  it('falls back to PR for empty/non-alpha input', () => {
    expect(generateKey('')).toBe('PR')
    expect(generateKey('   ')).toBe('PR')
  })

  it('handles extra whitespace between words', () => {
    expect(generateKey('My   Big   Project')).toBe('MBP')
  })

  it('splits camelCase and PascalCase names', () => {
    expect(generateKey('ZeroPloy')).toBe('ZP')
    expect(generateKey('myProject')).toBe('MP')
    expect(generateKey('SuperTaskManager')).toBe('STM')
  })
})
