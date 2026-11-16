import { eq, and } from 'drizzle-orm'
import { fieldColumnCreateSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)
  const { field } = await readBodyAs(event, fieldColumnCreateSchema)

  // Check for duplicate field in this list
  const existing = db.select().from(schema.listColumns)
    .where(and(
      eq(schema.listColumns.listId, list.id),
      eq(schema.listColumns.field, field)
    ))
    .get()

  if (existing) {
    throw createError({ statusCode: 409, message: 'Field column already exists in this list' })
  }

  const maxPos = getMaxListColumnPosition(list.id)

  const column = db.insert(schema.listColumns).values({
    listId: list.id,
    field,
    position: maxPos + 1
  }).returning().get()

  emitViewChange(list.projectId)

  return column
})
