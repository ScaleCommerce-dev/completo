import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const { userId } = await readBody<{ userId: string }>(event)
  if (!userId) {
    throw createError({ statusCode: 400, message: 'userId is required' })
  }

  db.update(schema.users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(schema.users.id, userId))
    .run()

  return { ok: true }
})
