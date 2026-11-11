import { describe, it, expect } from 'vitest'
import { safeReturnPath } from '../../app/utils/return-path'

describe('safeReturnPath', () => {
  it('returns a same-site path as given', () => {
    expect(safeReturnPath('/projects/demo/boards/sprint?x=1')).toBe('/projects/demo/boards/sprint?x=1')
    expect(safeReturnPath('/oauth/authorize?client_id=a&redirect_uri=b')).toBe('/oauth/authorize?client_id=a&redirect_uri=b')
  })

  it('refuses anything a browser would take off the site', () => {
    for (const evil of ['//evil.example', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', 'evil.example', ''])
      expect(safeReturnPath(evil), evil).toBe('/projects')
  })

  it('refuses a sign-in page, which would loop back to the form', () => {
    expect(safeReturnPath('/login')).toBe('/projects')
    expect(safeReturnPath('/logout?x')).toBe('/projects')
    expect(safeReturnPath('/loginfo')).toBe('/loginfo')
  })

  it('falls back on a missing or repeated query value', () => {
    expect(safeReturnPath(undefined)).toBe('/projects')
    expect(safeReturnPath(['/a', '/b'])).toBe('/projects')
  })
})
