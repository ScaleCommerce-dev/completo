import type { H3Event } from 'h3'

interface RateLimitEntry {
  count: number
  resetAt: number
}

const stores = new Map<string, Map<string, RateLimitEntry>>()

interface RateLimitOptions {
  /** Unique name for this limiter (e.g. 'auth', 'api') */
  name: string
  /** Max requests per window */
  max: number
  /** Window duration in seconds */
  windowSeconds: number
  /** What to count against; defaults to the client address (see `pickClientIp`). */
  key?: string
}

/**
 * In-memory rate limiter, keyed by client address unless a `key` is given.
 * Throws 429 if limit exceeded.
 */
export function checkRateLimit(event: H3Event, options: RateLimitOptions) {
  const { name, max, windowSeconds } = options
  const ip = options.key ?? pickClientIp(
    event.node.req.socket?.remoteAddress,
    getRequestHeader(event, 'x-forwarded-for'),
    trustedProxyHops()
  )

  if (!stores.has(name)) {
    stores.set(name, new Map())
  }
  const store = stores.get(name)!
  const now = Date.now()

  // Clean expired entries periodically (every 100 checks)
  if (Math.random() < 0.01) {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key)
    }
  }

  const entry = store.get(ip)
  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + windowSeconds * 1000 })
    return
  }

  entry.count++
  if (entry.count > max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000)
    setResponseHeader(event, 'Retry-After', retryAfter)
    throw createError({ statusCode: 429, message: 'Too many requests. Please try again later.' })
  }
}

/**
 * Guesses at a signed-in person's own password: changing it and deleting the
 * account both ask for it, and both are reachable with an API token, so without
 * this a leaked token was an unthrottled oracle for the password behind it. Per
 * account, every attempt counted, which no real person comes near.
 */
export function checkCurrentPasswordAttempt(event: H3Event, userId: string) {
  checkRateLimit(event, { name: 'current-password', max: 10, windowSeconds: 900, key: userId })
}

/**
 * Invitation and "added you" emails one person may cause per hour. The project
 * name and the sender's display name are theirs to choose and land in a mail
 * sent from this server, so an unbounded loop over addresses made it a relay.
 * Only checked when mail is configured: with none, nothing is sent.
 */
export function checkInvitationMailBudget(event: H3Event, userId: string) {
  checkRateLimit(event, { name: 'invitation-mail', max: 30, windowSeconds: 3600, key: userId })
}
