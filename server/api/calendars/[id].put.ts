import { eq } from 'drizzle-orm'
import { calendarUpdateSchema } from '#shared/schemas/calendar'

/** `PUT /api/calendars/:id`: rename it, or store the filters it now shows. */
export default defineEventHandler(async (event) => {
  const { calendar } = await resolveCalendar(event)
  const body = await readBodyAs(event, calendarUpdateSchema)
  const row = db.update(schema.calendars).set({
    ...(body.name !== undefined && { name: body.name }),
    ...(body.filters !== undefined && { filters: JSON.stringify(body.filters) })
  }).where(eq(schema.calendars.id, calendar.id)).returning().get()
  return calendarView(row!)
})
