import { eq } from 'drizzle-orm'
import { loginSchema } from '#shared/schemas/auth'

export default defineEventHandler(async (event) => {
  const { email, password } = await readBodyAs(event, loginSchema)

  // Normalised to match how register/OAuth/admin-create store it — `users.email` is UNIQUE
  // but not COLLATE NOCASE, so an exact-case lookup made sign-in capitalisation-sensitive.
  const user = db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase())).get()
  // An agent acts only through API tokens. Its hash is unhashable anyway; the kind
  // check is the guard, and it answers exactly like a wrong password.
  if (!user || user.kind === 'agent' || !await verifyPassword(user.passwordHash, password)) {
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
