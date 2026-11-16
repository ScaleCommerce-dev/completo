import { z } from 'zod'
import { SORTABLE_LIST_FIELDS } from '../utils/list-fields'
import { NOTHING_TO_UPDATE, position, priority, requiredText, slug, somethingToUpdate } from './common'

/**
 * A filter: the ids or values a view keeps. An empty list and null both mean "no
 * filter"; null used to reach `.length` and come back as a 500, and a string was
 * stored as a JSON string the view then could not read.
 */
const idFilter = (field: string) =>
  z.array(z.string({ error: `${field} must be a list of ids` }), { error: `${field} must be a list of ids or null` }).nullable()

/** What boards and lists share in `PUT /api/{boards,lists}/:id`. */
const viewUpdateFields = {
  name: requiredText('Name').optional(),
  slug: slug.optional(),
  tagFilters: idFilter('tagFilters').optional(),
  statusFilters: idFilter('statusFilters').optional(),
  assigneeFilters: idFilter('assigneeFilters').optional(),
  priorityFilters: z.array(priority, { error: 'priorityFilters must be a list of priorities or null' }).nullable().optional(),
  showSubtasks: z.boolean({ error: 'showSubtasks must be a boolean' }).optional()
}

export const boardUpdateSchema = z.object({
  ...viewUpdateFields,
  // Unknown *keys* inside it are dropped by `normalizeHiddenCardFields`, so a board
  // saved by a newer release loses a field this one has never heard of rather
  // than failing to save. A wrong *shape* is refused: a string or null used to be
  // read as `[]` and silently cleared the board's display settings.
  hiddenCardFields: z.array(z.string(), { error: 'hiddenCardFields must be an array' }).optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)
export type BoardUpdateBody = z.output<typeof boardUpdateSchema>

export const listUpdateSchema = z.object({
  ...viewUpdateFields,
  sortField: z.string().refine(f => SORTABLE_LIST_FIELDS.has(f), { error: 'Invalid sort field' })
    .nullable().optional(),
  sortDirection: z.enum(['asc', 'desc'], { error: 'Invalid sort direction' }).nullable().optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)
export type ListUpdateBody = z.output<typeof listUpdateSchema>

/** A filter list as stored: JSON, or null for none. */
export function storedFilter(values: readonly string[] | null): string | null {
  return values?.length ? JSON.stringify(values) : null
}

/** `PUT /api/{boards,lists}/:id/columns/reorder`: the new position of each column. */
export const columnReorderSchema = z.object({
  columns: z.array(z.object({ id: z.string({ error: 'Each column needs an id' }), position }), { error: 'Columns array is required' })
    .min(1, { error: 'Columns array is required' })
})
