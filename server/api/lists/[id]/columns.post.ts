import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user: _user, list } = await resolveList(event)
  const { field } = await readBody<{ field: string }>(event)

  if (!field) {
    throw createError({ statusCode: 400, message: 'Field is required' })
  }

  if (!isListField(field)) {
    throw createError({ statusCode: 400, message: `Invalid field. Must be one of: ${LIST_FIELD_KEYS.join(', ')}` })
  }

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

  return column
})
