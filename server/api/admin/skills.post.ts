import { sql } from 'drizzle-orm'
import { skillCreateSchema } from '#shared/schemas/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { name, prompt, scope } = await readBodyAs(event, skillCreateSchema)

  const maxPos = db.select({ pos: sql<number>`coalesce(max(${schema.aiSkills.position}), -1)` })
    .from(schema.aiSkills)
    .get()

  const skill = db.insert(schema.aiSkills).values({
    name,
    prompt,
    scope: scope || 'card',
    position: (maxPos?.pos ?? -1) + 1
  }).returning().get()

  setResponseStatus(event, 201)
  return skill
})
