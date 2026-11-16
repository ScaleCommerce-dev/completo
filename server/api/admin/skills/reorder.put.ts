import { eq } from 'drizzle-orm'
import { skillReorderSchema } from '#shared/schemas/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { skills } = await readBodyAs(event, skillReorderSchema)

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
