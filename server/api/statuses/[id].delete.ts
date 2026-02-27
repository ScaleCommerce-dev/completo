import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { status } = await resolveStatus(event)

  db.delete(schema.statuses).where(eq(schema.statuses.id, status.id)).run()
  return { ok: true }
})
