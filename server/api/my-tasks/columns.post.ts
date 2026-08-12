import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { field } = await readBody<{ field: string }>(event)

  if (!field) {
    throw createError({ statusCode: 400, message: 'Field is required' })
  }

  if (!isListField(field)) {
    throw createError({ statusCode: 400, message: `Invalid field. Must be one of: ${LIST_FIELD_KEYS.join(', ')}` })
  }

  const existing = db.select().from(schema.myTasksColumns)
    .where(and(
      eq(schema.myTasksColumns.userId, user.id),
      eq(schema.myTasksColumns.field, field)
    ))
    .get()

  if (existing) {
    throw createError({ statusCode: 409, message: 'Field column already exists' })
  }

  const maxPos = getMaxMyTasksColumnPosition(user.id)

  const column = db.insert(schema.myTasksColumns).values({
    userId: user.id,
    field,
    position: maxPos + 1
  }).returning().get()

  return column
})
