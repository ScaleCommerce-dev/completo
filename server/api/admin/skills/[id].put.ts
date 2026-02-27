import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const id = getRouterParam(event, 'id')!
  const skill = db.select().from(schema.aiSkills).where(eq(schema.aiSkills.id, id)).get()
  if (!skill) {
    throw createError({ statusCode: 404, message: 'Skill not found' })
  }

  const body = await readBody(event)
  const updates: Record<string, any> = {}

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw createError({ statusCode: 400, message: 'Name cannot be empty' })
    }
    updates.name = body.name.trim()
  }

  if (body.prompt !== undefined) {
    if (typeof body.prompt !== 'string' || !body.prompt.trim()) {
      throw createError({ statusCode: 400, message: 'Prompt cannot be empty' })
    }
    updates.prompt = body.prompt.trim()
  }

  if (body.scope !== undefined) {
    if (body.scope !== 'card' && body.scope !== 'board') {
      throw createError({ statusCode: 400, message: 'Scope must be "card" or "board"' })
    }
    updates.scope = body.scope
  }

  if (Object.keys(updates).length === 0) {
    return skill
  }

  updates.updatedAt = new Date()

  return db.update(schema.aiSkills)
    .set(updates)
    .where(eq(schema.aiSkills.id, id))
    .returning()
    .get()
})
