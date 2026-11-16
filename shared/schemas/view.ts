import { z } from 'zod'
import { LIST_FIELD_KEYS, SORTABLE_LIST_FIELDS, isListField } from '../utils/list-fields'
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

/**
 * `POST /api/projects/:id/{boards,lists}`. An empty or absent slug is derived from
 * the name by the handler. `columns` are status ids for a board and field names for
 * a list, so each endpoint narrows them with its own schema below.
 */
const viewCreateFields = (kind: 'Board' | 'List') => ({
  name: requiredText(`${kind} name`),
  slug: z.string({ error: 'Invalid slug format' }).optional(),
  tagFilters: idFilter('tagFilters').optional()
})

export const boardCreateSchema = z.object({
  ...viewCreateFields('Board'),
  columns: z.array(z.string({ error: 'columns must be a list of status ids' }), { error: 'columns must be a list of status ids' }).optional()
})

const INVALID_FIELD = `Invalid field. Must be one of: ${LIST_FIELD_KEYS.join(', ')}`

export const listCreateSchema = z.object({
  ...viewCreateFields('List'),
  columns: z.array(z.string({ error: 'columns must be a list of field names' }), { error: 'columns must be a list of field names' })
    .superRefine((fields, ctx) => {
      const invalid = fields.filter(f => !isListField(f))
      if (invalid.length) ctx.addIssue({ code: 'custom', message: `Invalid field(s): ${invalid.join(', ')}. Must be one of: ${LIST_FIELD_KEYS.join(', ')}` })
    })
    .optional()
})

/** `POST /api/lists/:id/columns` and `POST /api/my-tasks/columns`: one field column. */
export const fieldColumnCreateSchema = z.object({
  field: z.string({ error: 'Field is required' }).min(1, { error: 'Field is required' })
    .refine(isListField, { error: INVALID_FIELD })
})

/** `POST /api/boards/:id/columns/link`: an existing status of the board's project. */
export const columnLinkSchema = z.object({
  statusId: z.string({ error: 'statusId is required' }).min(1, { error: 'statusId is required' })
})

/** `POST /api/my-tasks/collapse`: the project group to fold or unfold. */
export const myTasksCollapseSchema = z.object({
  projectId: z.string({ error: 'projectId is required' }).min(1, { error: 'projectId is required' })
})
