import { z } from 'zod'
import { cardRef, dueDate, NOTHING_TO_UPDATE, position, priority, requiredText, somethingToUpdate } from './common'

/**
 * `POST /api/projects/:id/cards`. Everything but the title is optional: the
 * status defaults to the project's first that is not Done (`defaultStatusId`),
 * and an empty string for an optional id means "none", as the create form sends.
 * Whether the status, assignee and parent belong to the project is the handler's
 * check, since it needs the database.
 */
export const cardCreateSchema = z.object({
  title: requiredText('Title'),
  statusId: z.string({ error: 'statusId must be a status id' }).optional(),
  description: z.string({ error: 'Description must be text' }).nullish(),
  priority: priority.optional(),
  assigneeId: z.string({ error: 'assigneeId must be a user id' }).nullish(),
  dueDate: dueDate.optional(),
  parentId: cardRef.nullish()
})
export type CardCreateBody = z.output<typeof cardCreateSchema>

/** `PUT /api/cards/:id`. A field left out is left alone; null clears what can be empty. */
export const cardUpdateSchema = z.object({
  title: requiredText('Title').optional(),
  statusId: z.string({ error: 'statusId must be a status id' }).optional(),
  description: z.string({ error: 'Description must be text' }).nullable().optional(),
  priority: priority.optional(),
  assigneeId: z.string({ error: 'assigneeId must be a user id or null' }).nullable().optional(),
  dueDate: dueDate.optional(),
  parentId: cardRef.nullable().optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)
export type CardUpdateBody = z.output<typeof cardUpdateSchema>

/** `PUT /api/cards/:id/move`: a status of the card's project, and where in it. */
export const cardMoveSchema = z.object({
  statusId: z.string({ error: 'statusId and position are required' }).min(1, { error: 'statusId and position are required' }),
  position
})

/** `PUT /api/cards/:id/tags`: the card's whole tag set, replacing what it had. */
export const cardTagsSchema = z.object({
  tagIds: z.array(z.string({ error: 'tagIds must be a list of tag ids' }), { error: 'tagIds must be an array' })
})

/**
 * `POST /api/cards/:id/duplicate`. Without `tagIds` the copy takes the board's tag
 * filter; a value that is not a list used to fall back to it silently.
 */
export const cardDuplicateSchema = z.object({
  title: z.string({ error: 'Title is required' }).trim().min(1, { error: 'Title is required' }),
  boardId: z.string({ error: 'boardId is required' }).min(1, { error: 'boardId is required' }),
  tagIds: z.array(z.string({ error: 'tagIds must be a list of tag ids' }), { error: 'tagIds must be a list of tag ids' }).optional()
})
