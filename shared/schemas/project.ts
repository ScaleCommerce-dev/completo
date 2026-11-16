import { z } from 'zod'
import { hexColor, NOTHING_TO_UPDATE, requiredText, slug, somethingToUpdate } from './common'

const projectKey = z.string({ error: 'Project key must be 2-5 uppercase letters' })
  .regex(/^[A-Z]{2,5}$/, { error: 'Project key must be 2-5 uppercase letters' })

/** Days a done card stays on views; null keeps it forever. Zero or less hid every done card. */
const doneRetentionDays = z.number({ error: 'doneRetentionDays must be a positive integer or null' })
  .int({ error: 'doneRetentionDays must be a positive integer or null' })
  .min(1, { error: 'doneRetentionDays must be a positive integer or null' })
  .nullable()

/**
 * `POST /api/projects`. An empty key or slug means "derive it", as the form sends
 * them; a slug given is normalised by the handler before it is checked.
 */
export const projectCreateSchema = z.object({
  name: requiredText('Project name'),
  key: z.union([z.literal(''), projectKey]).optional(),
  slug: z.string({ error: 'Slug must be text' }).optional(),
  description: z.string({ error: 'Description must be text' }).nullish(),
  briefing: z.string({ error: 'Briefing must be text' }).nullish(),
  icon: z.string({ error: 'Icon must be text' }).nullish(),
  doneStatusName: z.string({ error: 'doneStatusName must be text' }).optional(),
  doneRetentionDays: doneRetentionDays.optional()
})
export type ProjectCreateBody = z.output<typeof projectCreateSchema>

/** `PUT /api/projects/:id`. */
export const projectUpdateSchema = z.object({
  name: requiredText('Project name').optional(),
  key: projectKey.optional(),
  slug: slug.optional(),
  description: z.string({ error: 'Description must be text' }).nullable().optional(),
  briefing: z.string({ error: 'Briefing must be text' }).nullable().optional(),
  icon: z.string({ error: 'Icon must be text' }).nullable().optional(),
  doneStatusId: z.string({ error: 'doneStatusId must be a status id or null' }).nullable().optional(),
  doneRetentionDays: doneRetentionDays.optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)
export type ProjectUpdateBody = z.output<typeof projectUpdateSchema>

/** `PUT /api/statuses/:id` and `PUT /api/tags/:id`: a name, a colour, or both. */
export const nameColorUpdateSchema = z.object({
  name: requiredText('Name').optional(),
  color: hexColor.optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)
