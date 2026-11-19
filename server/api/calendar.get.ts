import { calendarFiltersSchema } from '#shared/schemas/calendar'

const DAY = /^\d{4}-\d{2}-\d{2}$/
/** Six weeks covers any month grid; a little more for a week either side. */
const MAX_DAYS = 62

const list = (value: unknown): string[] => (Array.isArray(value) ? value : value == null || value === '' ? [] : [value]).map(String)

/**
 * `GET /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD&tags=…&people=…&projects=…&statuses=…`
 *
 * The Calendar page: cards due in the window from every project the caller is a
 * member of, passing the filters (`server/utils/calendar-cards.ts`), and the
 * choices for each filter. Repeat a parameter for several values.
 */
export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const q = getQuery(event)
  const from = String(q.from ?? '')
  const to = String(q.to ?? '')
  const span = (Date.parse(to) - Date.parse(from)) / 86_400_000
  if (!DAY.test(from) || !DAY.test(to) || Number.isNaN(span) || span < 0 || span > MAX_DAYS) {
    throw createError({ statusCode: 400, message: `from and to must be days (YYYY-MM-DD), from before to, at most ${MAX_DAYS} days apart` })
  }
  const parsed = calendarFiltersSchema.safeParse({
    mode: q.mode || undefined,
    tags: list(q.tags),
    people: list(q.people),
    projects: list(q.projects),
    statuses: list(q.statuses)
  })
  if (!parsed.success) {
    throw createError({ statusCode: 400, message: parsed.error.issues[0]?.message ?? 'Invalid filters' })
  }
  return calendarCards(user.id, { from, to }, parsed.data)
})
