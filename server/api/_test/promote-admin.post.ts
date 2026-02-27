import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  // NODE_ENV is inlined at build time by Vite, so use a custom env var for runtime check
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  // Defense-in-depth: require authentication even in test mode
  await resolveAuth(event)

  const { userId } = await readBody<{ userId: string }>(event)
  if (!userId) {
    throw createError({ statusCode: 400, message: 'userId is required' })
  }

  db.update(schema.users)
    .set({ isAdmin: 1 })
    .where(eq(schema.users.id, userId))
    .run()

  return { ok: true }
})
