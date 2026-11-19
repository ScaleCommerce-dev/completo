import { eq } from 'drizzle-orm'
import { calendarCreateSchema } from '#shared/schemas/calendar'

/** `POST /api/calendars`: save the Calendar page's filters under a name. */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const body = await readBodyAs(event, calendarCreateSchema)
  const existing = db.select({ position: schema.calendars.position }).from(schema.calendars)
    .where(eq(schema.calendars.userId, user.id)).all()
  const row = db.insert(schema.calendars).values({
    userId: user.id,
    name: body.name,
    filters: JSON.stringify(body.filters),
    // max + 1, never a count: after a delete a count ties with an existing row.
    position: existing.reduce((max, c) => Math.max(max, c.position), -1) + 1
  }).returning().get()
  setResponseStatus(event, 201)
  return calendarView(row)
})
