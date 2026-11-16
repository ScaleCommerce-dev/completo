import { eq, and } from 'drizzle-orm'
import { fieldColumnCreateSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { field } = await readBodyAs(event, fieldColumnCreateSchema)

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
