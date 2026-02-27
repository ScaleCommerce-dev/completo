import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody(event)
  const { skills } = body || {}

  if (!Array.isArray(skills) || skills.length === 0) {
    throw createError({ statusCode: 400, message: 'Skills array is required' })
  }

  for (const s of skills) {
    if (!s.id || typeof s.position !== 'number') {
      throw createError({ statusCode: 400, message: 'Each skill must have id and position' })
    }
  }

  db.transaction((tx) => {
    for (const s of skills) {
      tx.update(schema.aiSkills)
        .set({ position: s.position, updatedAt: new Date() })
        .where(eq(schema.aiSkills.id, s.id))
        .run()
    }
  })

  return { ok: true }
})
