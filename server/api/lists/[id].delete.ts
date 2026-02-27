import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)

  db.delete(schema.lists).where(eq(schema.lists.id, list.id)).run()
  return { ok: true }
})
