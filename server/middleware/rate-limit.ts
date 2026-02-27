export default defineEventHandler((event) => {
  // Skip rate limiting in test environment
  if (process.env.ALLOW_TEST_ENDPOINTS) return

  const path = getRequestURL(event).pathname
  const method = getMethod(event)

  // Rate-limit AI generation endpoints
  if (method === 'POST' && /^\/api\/projects\/[^/]+\/ai\//.test(path)) {
    checkRateLimit(event, { name: 'ai-generation', max: 10, windowSeconds: 60 })
    return
  }

  // Rate-limit file uploads
  if (method === 'POST' && /^\/api\/cards\/[^/]+\/attachments$/.test(path)) {
    checkRateLimit(event, { name: 'file-upload', max: 20, windowSeconds: 60 })
    return
  }

  // Only rate-limit POST auth endpoints (login, register, forgot-password, etc.)
  if (method !== 'POST' || !path.startsWith('/auth/')) return

  // Stricter limit for login (brute-force protection)
  if (path === '/auth/login') {
    checkRateLimit(event, { name: 'auth-login', max: 10, windowSeconds: 300 })
    return
  }

  // Stricter limit for registration (spam protection)
  if (path === '/auth/register') {
    checkRateLimit(event, { name: 'auth-register', max: 5, windowSeconds: 300 })
    return
  }

  // General auth endpoint limit (forgot-password, resend-verification, etc.)
  const rateLimitedPaths = [
    '/auth/forgot-password',
    '/auth/resend-verification',
    '/auth/setup-account',
    '/auth/reset-password'
  ]
  if (rateLimitedPaths.includes(path)) {
    checkRateLimit(event, { name: 'auth-general', max: 10, windowSeconds: 300 })
  }
})
