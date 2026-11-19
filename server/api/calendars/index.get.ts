import { asc, eq } from 'drizzle-orm'

/** `GET /api/calendars`: the caller's saved calendars, for the sidebar. */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  return db.select().from(schema.calendars)
    .where(eq(schema.calendars.userId, user.id))
    .orderBy(asc(schema.calendars.position), asc(schema.calendars.createdAt))
    .all()
    .map(calendarView)
})
