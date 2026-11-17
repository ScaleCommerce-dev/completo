import { eq } from 'drizzle-orm'
import { listUpdateSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { list } = await resolveList(event)
  const body = await readBodyAs(event, listUpdateSchema)

  // Name, slug, filters and the sub-task setting, as on a board (`server/utils/views.ts`).
  const updates = sharedViewUpdates(schema.lists, list, body)

  if (body.sortField !== undefined) updates.sortField = body.sortField
  if (body.sortDirection !== undefined) updates.sortDirection = body.sortDirection

  db.update(schema.lists).set(updates).where(eq(schema.lists.id, list.id)).run()

  // Sort, filters, name and slug all change what this list shows.
  emitViewChange(list.projectId)

  return db.select().from(schema.lists).where(eq(schema.lists.id, list.id)).get()
})
