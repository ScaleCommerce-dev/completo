import { eq, and } from 'drizzle-orm'
import { columnReorderSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)
  const { columns: columnOrder } = await readBodyAs(event, columnReorderSchema)

  db.transaction(() => {
    for (const col of columnOrder) {
      db.update(schema.listColumns)
        .set({ position: col.position })
        .where(and(
          eq(schema.listColumns.listId, list.id),
          eq(schema.listColumns.id, col.id)
        ))
        .run()
    }
  })

  emitViewChange(list.projectId)

  return { ok: true }
})
