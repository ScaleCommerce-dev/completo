import { eq } from 'drizzle-orm'

/** `DELETE /api/calendars/:id`. Only the saved filters go; no card is touched. */
export default defineEventHandler(async (event) => {
  const { calendar } = await resolveCalendar(event)
  db.delete(schema.calendars).where(eq(schema.calendars.id, calendar.id)).run()
  return { ok: true }
})
