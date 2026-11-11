import { eq } from 'drizzle-orm'

// Test-only: write `email_notifications` directly, for any row. The profile endpoint
// refuses agents, so this is how a test gives an agent the flag a bug or a hand edit
// could, and proves the card-email exit guard drops agents by kind and not by flag.
export default defineEventHandler(async (event) => {
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  const { userId, on } = await readBody<{ userId: string, on: boolean }>(event)
  if (!userId) {
    throw createError({ statusCode: 400, message: 'userId is required' })
  }
  db.update(schema.users)
    .set({ emailNotifications: on ? 1 : 0 })
    .where(eq(schema.users.id, userId))
    .run()
  return { ok: true }
})
