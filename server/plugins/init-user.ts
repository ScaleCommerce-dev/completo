import { eq } from 'drizzle-orm'

export default defineNitroPlugin(async () => {
  if (process.env.NODE_ENV === 'test') return

  const email = process.env.INIT_USER_EMAIL
  const password = process.env.INIT_USER_PASSWORD

  if (!email || !password) {
    if (email || password) {
      console.warn('[init-user] INIT_USER_EMAIL and INIT_USER_PASSWORD must both be set to auto-create a user')
    }
    return
  }

  const name = process.env.INIT_USER_NAME || email.split('@')[0] || email
  const isAdmin = ['1', 'true', 'TRUE', 'yes', 'YES'].includes(process.env.INIT_USER_ADMIN || '')

  try {
    const existing = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get()
    if (existing) return

    db.insert(schema.users).values({
      email,
      name,
      passwordHash: await hashPassword(password),
      isAdmin: isAdmin ? 1 : 0,
      emailVerifiedAt: new Date()
    }).run()

    console.log(`[init-user] Created ${isAdmin ? 'admin' : 'user'}: ${name} (${email})`)
  } catch (err) {
    console.warn('[init-user] Failed to create initial user:', err instanceof Error ? err.message : err)
  }
})
