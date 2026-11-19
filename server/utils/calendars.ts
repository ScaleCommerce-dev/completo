import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'
import type { CalendarFilters } from '#shared/utils/calendar-filter'

/** A saved calendar as the API hands it out, with its filters parsed. */
export function calendarView(row: typeof schema.calendars.$inferSelect) {
  return { id: row.id, name: row.name, position: row.position, filters: safeParseJson<CalendarFilters>(row.filters, { mode: 'week', tags: [], people: [], projects: [], statuses: [] }) }
}

/** The caller's own saved calendar, or 404: another person's is not theirs to see or change. */
export async function resolveCalendar(event: H3Event) {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')!
  const row = db.select().from(schema.calendars)
    .where(and(eq(schema.calendars.id, id), eq(schema.calendars.userId, user.id)))
    .get()
  if (!row) throw createError({ statusCode: 404, message: 'Calendar not found' })
  return { user, calendar: row }
}
