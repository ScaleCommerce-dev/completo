import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tag } = await resolveTag(event)

  db.delete(schema.tags).where(eq(schema.tags.id, tag.id)).run()
  return { ok: true }
})
