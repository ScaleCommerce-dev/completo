import { z } from 'zod'
import { CALENDAR_MODES } from '../utils/calendar-filter'
import { NOTHING_TO_UPDATE, requiredText, somethingToUpdate } from './common'

const names = (field: string, max: number) =>
  z.array(z.string({ error: `${field} must be a list of names` }).trim().min(1).max(50), { error: `${field} must be a list of names` })
    .max(max, { error: `At most ${max} ${field}` })

const ids = (field: string, max: number) =>
  z.array(z.string({ error: `${field} must be a list of ids` }).min(1), { error: `${field} must be a list of ids` })
    .max(max, { error: `At most ${max} ${field}` })

/** The Calendar page's filters, as a saved calendar stores them. */
export const calendarFiltersSchema = z.object({
  mode: z.enum(CALENDAR_MODES, { error: 'mode must be week or month' }).default('week'),
  tags: names('tags', 20).default([]),
  people: ids('people', 50).default([]),
  projects: ids('projects', 100).default([]),
  statuses: names('statuses', 50).default([])
})

/** `POST /api/calendars` */
export const calendarCreateSchema = z.object({
  name: requiredText('Name').pipe(z.string().max(80, { error: 'Name is at most 80 characters' })),
  filters: calendarFiltersSchema
})

/** `PUT /api/calendars/:id` */
export const calendarUpdateSchema = z.object({
  name: requiredText('Name').pipe(z.string().max(80, { error: 'Name is at most 80 characters' })).optional(),
  filters: calendarFiltersSchema.optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)
