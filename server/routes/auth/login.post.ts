import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBody<{ email: string, password: string }>(event)

  if (!email || !password) {
    throw createError({ statusCode: 400, message: 'Email and password are required' })
  }

  const user = db.select().from(schema.users).where(eq(schema.users.email, email)).get()
  if (!user || !await verifyPassword(user.passwordHash, password)) {
    throw createError({ statusCode: 401, message: 'Invalid email or password' })
  }

  if (!user.emailVerifiedAt) {
    throw createError({ statusCode: 403, message: 'Please verify your email address before logging in.' })
  }

  ensureNotSuspended(user)

  db.update(schema.users)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.users.id, user.id))
    .run()

  await setAuthSession(event, user)

  return { user: { id: user.id, email: user.email, name: user.name } }
})
