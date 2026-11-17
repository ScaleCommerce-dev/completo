import { eq } from 'drizzle-orm'
import { boardUpdateSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { board } = await resolveBoard(event)
  const body = await readBodyAs(event, boardUpdateSchema)

  // Name, slug, filters and the sub-task setting, as on a list (`server/utils/views.ts`).
  const updates = sharedViewUpdates(schema.boards, board, body)

  if (body.hiddenCardFields !== undefined) {
    const hidden = normalizeHiddenCardFields(body.hiddenCardFields)
    updates.hiddenCardFields = hidden.length ? JSON.stringify(hidden) : null
  }

  db.update(schema.boards).set(updates).where(eq(schema.boards.id, board.id)).run()

  // Filters, hidden fields, name and slug all change what this board shows.
  emitViewChange(board.projectId)

  const updated = db.select().from(schema.boards).where(eq(schema.boards.id, board.id)).get()
  return updated ? { ...updated, hiddenCardFields: normalizeHiddenCardFields(safeParseJson(updated.hiddenCardFields, [])) } : updated
})
