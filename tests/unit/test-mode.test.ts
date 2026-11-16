import { describe, it, expect, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { testEndpointsEnabled } from '../../server/utils/test-mode'

const ROOT = join(import.meta.dirname, '../..')

/**
 * The test endpoints hand out verification and reset tokens. A truthiness check
 * turned them on for `ALLOW_TEST_ENDPOINTS=false` and `=0`, the two ways an
 * operator would write "off".
 */
describe('ALLOW_TEST_ENDPOINTS', () => {
  const saved = process.env.ALLOW_TEST_ENDPOINTS
  afterEach(() => {
    if (saved === undefined) delete process.env.ALLOW_TEST_ENDPOINTS
    else process.env.ALLOW_TEST_ENDPOINTS = saved
  })

  it.each(['false', '0', 'no', 'true', ' 1', ''])('stays off for %j', (value) => {
    process.env.ALLOW_TEST_ENDPOINTS = value
    expect(testEndpointsEnabled()).toBe(false)
  })

  it('is on for exactly "1"', () => {
    process.env.ALLOW_TEST_ENDPOINTS = '1'
    expect(testEndpointsEnabled()).toBe(true)
  })

  it('is read in one place, so no reader can fall back to truthiness', () => {
    const readers = execSync(`grep -rln "process.env.ALLOW_TEST_ENDPOINTS" ${ROOT}/server || true`, { encoding: 'utf8' })
      .trim().split('\n').filter(Boolean).map(f => f.replace(`${ROOT}/`, ''))
    expect(readers).toEqual(['server/utils/test-mode.ts'])
  })
})
