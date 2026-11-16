import { eq } from 'drizzle-orm'
import { skillUpdateSchema } from '#shared/schemas/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')!
  const skill = db.select().from(schema.aiSkills).where(eq(schema.aiSkills.id, id)).get()
  if (!skill) {
    throw createError({ statusCode: 404, message: 'Skill not found' })
  }

  const { name, prompt, scope } = await readBodyAs(event, skillUpdateSchema)
  const updates: Record<string, string | Date> = {}
  if (name !== undefined) updates.name = name
  if (prompt !== undefined) updates.prompt = prompt
  if (scope !== undefined) updates.scope = scope

  updates.updatedAt = new Date()

  return db.update(schema.aiSkills)
    .set(updates)
    .where(eq(schema.aiSkills.id, id))
    .returning()
    .get()
})
