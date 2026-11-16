import { eq, and } from 'drizzle-orm'
import { columnReorderSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { columns: columnOrder } = await readBodyAs(event, columnReorderSchema)

  db.transaction(() => {
    for (const col of columnOrder) {
      db.update(schema.myTasksColumns)
        .set({ position: col.position })
        .where(and(
          eq(schema.myTasksColumns.userId, user.id),
          eq(schema.myTasksColumns.id, col.id)
        ))
        .run()
    }
  })

  return { ok: true }
})
