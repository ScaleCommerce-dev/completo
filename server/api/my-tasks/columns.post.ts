import { eq, and } from 'drizzle-orm'

const VALID_FIELDS = ['ticketId', 'title', 'status', 'assignee', 'priority', 'tags', 'dueDate', 'createdAt', 'updatedAt', 'description', 'done']

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const { field } = await readBody<{ field: string }>(event)

  if (!field) {
    throw createError({ statusCode: 400, message: 'Field is required' })
  }

  if (!VALID_FIELDS.includes(field)) {
    throw createError({ statusCode: 400, message: `Invalid field. Must be one of: ${VALID_FIELDS.join(', ')}` })
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
