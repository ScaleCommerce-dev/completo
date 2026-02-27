import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')!
  const skill = db.select().from(schema.aiSkills).where(eq(schema.aiSkills.id, id)).get()
  if (!skill) {
    throw createError({ statusCode: 404, message: 'Skill not found' })
  }

  db.delete(schema.aiSkills).where(eq(schema.aiSkills.id, id)).run()

  return { ok: true }
})
