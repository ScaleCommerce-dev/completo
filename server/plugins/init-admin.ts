import { eq } from 'drizzle-orm'

export default defineNitroPlugin(async () => {
  if (process.env.NODE_ENV === 'test') return

  const email = process.env.ADMIN_USER_EMAIL
  const password = process.env.ADMIN_USER_PASSWORD

  if (!email || !password) {
    if (email || password) {
      console.warn('[admin-user] ADMIN_USER_EMAIL and ADMIN_USER_PASSWORD must both be set to auto-create the admin')
    }
    return
  }

  const name = process.env.ADMIN_USER_NAME || email.split('@')[0] || email

  try {
    const existing = db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, email)).get()
    // The seed script (db-seed.ts) creates the admin from these same env
    // vars before the server boots — in production this branch is the
    // normal path and stays silent. It only matters as a fallback for
    // `pnpm dev` when the seed wasn't run.
    if (existing) return

    db.insert(schema.users).values({
      email,
      name,
      passwordHash: await hashPassword(password),
      isAdmin: 1,
      emailVerifiedAt: new Date()
    }).run()

    console.log(`[admin-user] Created admin: ${name} (${email})`)
  } catch (err) {
    console.warn('[admin-user] Failed to create admin:', err instanceof Error ? err.message : err)
  }
})
