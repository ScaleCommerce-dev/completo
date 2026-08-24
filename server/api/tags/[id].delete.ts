import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tag } = await resolveTag(event)

  db.delete(schema.tags).where(eq(schema.tags.id, tag.id)).run()

  // The pill disappears from every card that carried it.
  emitViewChange(tag.projectId)

  return { ok: true }
})
