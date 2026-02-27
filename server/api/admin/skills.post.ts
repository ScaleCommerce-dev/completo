import { sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody(event)
  const { name, prompt, scope } = body || {}

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw createError({ statusCode: 400, message: 'Name is required' })
  }

  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    throw createError({ statusCode: 400, message: 'Prompt is required' })
  }

  if (scope && scope !== 'card' && scope !== 'board') {
    throw createError({ statusCode: 400, message: 'Scope must be "card" or "board"' })
  }

  const maxPos = db.select({ pos: sql<number>`coalesce(max(${schema.aiSkills.position}), -1)` })
    .from(schema.aiSkills)
    .get()

  const skill = db.insert(schema.aiSkills).values({
    name: name.trim(),
    prompt: prompt.trim(),
    scope: scope || 'card',
    position: (maxPos?.pos ?? -1) + 1
  }).returning().get()

  setResponseStatus(event, 201)
  return skill
})
