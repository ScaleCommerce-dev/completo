import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const query = getQuery(event)
  const userId = query.userId as string
  if (!userId) {
    throw createError({ statusCode: 400, message: 'userId is required' })
  }

  const tokenRow = db.select()
    .from(schema.emailVerificationTokens)
    .where(eq(schema.emailVerificationTokens.userId, userId))
    .get()

  return { token: tokenRow?.token || null }
})
