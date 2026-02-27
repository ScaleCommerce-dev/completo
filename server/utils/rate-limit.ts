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
}

/**
 * In-memory rate limiter keyed by client IP.
 * Throws 429 if limit exceeded.
 */
export function checkRateLimit(event: H3Event, options: RateLimitOptions) {
  const { name, max, windowSeconds } = options
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

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
