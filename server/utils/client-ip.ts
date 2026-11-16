import { isIP } from 'node:net'

/**
 * The address a request came from, for rate limiting.
 *
 * `X-Forwarded-For` is a list each proxy *appends* to, so only its rightmost entries
 * were written by proxies we run; everything to their left is whatever the client
 * sent. h3's `getRequestIP(event, { xForwardedFor: true })` returns the leftmost
 * entry, so keying the limiter on it let a client send a fresh header per request
 * and never be limited — login brute force included.
 *
 * `hops` is how many proxies in front of the app append to the header: the client is
 * the entry that many places from the right. `undefined` means "not configured": one
 * hop is trusted when the direct peer is a loopback or private address (a reverse
 * proxy on the same host or network), and none when it is public (the container is
 * reachable directly, where the header is entirely the client's).
 */
export function pickClientIp(remoteAddress: string | undefined, forwardedFor: string | undefined, hops: number | undefined): string {
  const peer = remoteAddress || 'unknown'
  const effectiveHops = hops ?? (isPrivateAddress(peer) ? 1 : 0)
  if (effectiveHops <= 0 || !forwardedFor) return peer

  const entries = forwardedFor.split(',').map(s => s.trim()).filter(Boolean)
  if (!entries.length) return peer
  const candidate = entries[Math.max(0, entries.length - effectiveHops)]!
  return isIP(candidate) ? candidate : peer
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:(?=\d+\.)/, '')
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number) as [number, number]
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254)
  }
  if (isIP(ip) === 6) {
    return ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)
  }
  return false
}

/** `TRUSTED_PROXY_HOPS`, or undefined when unset or not a non-negative integer. */
export function trustedProxyHops(): number | undefined {
  const raw = process.env.TRUSTED_PROXY_HOPS
  if (raw === undefined || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isInteger(n) && n >= 0 ? n : undefined
}
