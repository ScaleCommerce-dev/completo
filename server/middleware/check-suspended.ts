import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // Only check API/auth routes, skip static assets
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/') && !path.startsWith('/auth/')) return

  // Skip login/register/logout — suspension is checked at login time
  if (path === '/auth/login' || path === '/auth/register' || path === '/auth/logout'
    || path === '/auth/verify-email' || path === '/auth/resend-verification') return

  // Skip Bearer token auth — suspension is checked inside resolveAuth()
  const authHeader = getRequestHeader(event, 'authorization')
  if (authHeader?.startsWith('Bearer dzo_')) return

  let session
  try {
    session = await getUserSession(event)
  } catch {
    return // No session — let the endpoint handle auth
  }

  if (!session?.user?.id) return

  const user = db.select({ suspendedAt: schema.users.suspendedAt })
    .from(schema.users)
    .where(eq(schema.users.id, session.user.id))
    .get()

  if (user?.suspendedAt) {
    await clearUserSession(event)
    throw createError({ statusCode: 403, message: 'Your account has been suspended' })
  }
})
