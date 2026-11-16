import { describe, it, expect } from 'vitest'
import { pickClientIp, isPrivateAddress } from '../../server/utils/client-ip'

/**
 * The rate limiter's key. It used to be the leftmost `X-Forwarded-For` entry, which
 * the client writes, so a fresh header per request voided every limiter.
 */
describe('pickClientIp', () => {
  it('ignores the header when the container is reached directly', () => {
    expect(pickClientIp('203.0.113.7', '1.2.3.4', undefined)).toBe('203.0.113.7')
  })

  it('takes the entry the proxy appended, not the one the client sent', () => {
    // Client sent "X-Forwarded-For: 1.2.3.4"; a proxy on the host appended the real address.
    expect(pickClientIp('127.0.0.1', '1.2.3.4, 203.0.113.7', undefined)).toBe('203.0.113.7')
    expect(pickClientIp('::ffff:172.18.0.2', '9.9.9.9, 203.0.113.7', undefined)).toBe('203.0.113.7')
  })

  it('a spoofed header changes nothing behind a proxy', () => {
    const keys = new Set(['1.1.1.1', '2.2.2.2', '3.3.3.3'].map(spoof => pickClientIp('10.0.0.5', `${spoof}, 203.0.113.7`, undefined)))
    expect([...keys]).toEqual(['203.0.113.7'])
  })

  it('counts configured hops from the right', () => {
    // CDN -> reverse proxy -> app: two appenders.
    expect(pickClientIp('10.0.0.5', '1.2.3.4, 203.0.113.7, 198.51.100.9', 2)).toBe('203.0.113.7')
    expect(pickClientIp('10.0.0.5', '203.0.113.7', 2)).toBe('203.0.113.7')
  })

  it('TRUSTED_PROXY_HOPS=0 never trusts the header', () => {
    expect(pickClientIp('10.0.0.5', '203.0.113.7', 0)).toBe('10.0.0.5')
  })

  it('falls back to the peer on a missing or malformed header', () => {
    expect(pickClientIp('10.0.0.5', undefined, undefined)).toBe('10.0.0.5')
    expect(pickClientIp('10.0.0.5', 'not-an-ip', undefined)).toBe('10.0.0.5')
    expect(pickClientIp(undefined, undefined, undefined)).toBe('unknown')
  })
})

describe('isPrivateAddress', () => {
  it.each(['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.1.1', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1'])('%s is private', (ip) => {
    expect(isPrivateAddress(ip)).toBe(true)
  })
  it.each(['203.0.113.7', '172.32.0.1', '8.8.8.8', '2001:db8::1', '::ffff:8.8.8.8', 'unknown'])('%s is not', (ip) => {
    expect(isPrivateAddress(ip)).toBe(false)
  })
})
