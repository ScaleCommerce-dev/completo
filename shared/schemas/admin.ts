import { z } from 'zod'
import { AI_SKILL_SCOPES } from '../utils/ai-skills'
import { NOTHING_TO_UPDATE, position, somethingToUpdate } from './common'

/**
 * Admin request bodies. Whether the caller is an admin, and every rule that needs
 * the database (a duplicate email, an agent hand-over), stays in the handlers.
 */

const DOMAIN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/

/**
 * `PUT /api/admin/settings`. Domains are stored trimmed, lowercased and once
 * each; a blank entry is dropped rather than refused, as the form leaves one
 * behind when a row is cleared.
 */
export const adminSettingsSchema = z.object({
  allowedEmailDomains: z.array(
    z.string({ error: 'Each domain must be a string' }).trim().toLowerCase(),
    { error: 'allowedEmailDomains must be an array' }
  ).superRefine((domains, ctx) => {
    const bad = domains.find(d => d !== '' && !DOMAIN.test(d))
    if (bad !== undefined) ctx.addIssue({ code: 'custom', message: `Invalid domain: "${bad}"` })
  }).transform(domains => [...new Set(domains.filter(Boolean))]).optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)

const SCOPE_ERROR = `Scope must be one of: ${AI_SKILL_SCOPES.join(', ')}`
const scope = z.enum(AI_SKILL_SCOPES, { error: SCOPE_ERROR })

const text = (message: string) => z.string({ error: message }).trim().min(1, { error: message })

/** `POST /api/admin/skills`. No scope (or an empty one) means a card skill. */
export const skillCreateSchema = z.object({
  name: text('Name is required'),
  prompt: text('Prompt is required'),
  scope: z.union([z.literal(''), scope], { error: SCOPE_ERROR }).optional()
})

/** `PUT /api/admin/skills/:id`. */
export const skillUpdateSchema = z.object({
  name: text('Name cannot be empty').optional(),
  prompt: text('Prompt cannot be empty').optional(),
  scope: scope.optional()
}).refine(somethingToUpdate, NOTHING_TO_UPDATE)

/** `PUT /api/admin/skills/reorder`: the new position of each skill. */
export const skillReorderSchema = z.object({
  skills: z.array(z.object({
    id: z.string({ error: 'Each skill must have id and position' }).min(1, { error: 'Each skill must have id and position' }),
    position
  }, { error: 'Each skill must have id and position' }), { error: 'Skills array is required' })
    .min(1, { error: 'Skills array is required' })
})

/** `POST /api/admin/users`: an invitation to set up an account. */
export const adminUserCreateSchema = z.object({
  name: text('Name and email are required'),
  email: text('Name and email are required')
    .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, { error: 'Invalid email format' })
    .toLowerCase()
})

/** `PATCH /api/admin/users/:id`. */
export const adminUserPatchSchema = z.object({
  suspended: z.boolean({ error: 'suspended must be a boolean' }).optional(),
  isAdmin: z.boolean({ error: 'isAdmin must be a boolean' }).optional(),
  canCreateAgents: z.boolean({ error: 'canCreateAgents must be a boolean' }).optional()
}).refine(somethingToUpdate, { error: 'No valid fields to update' })

/** `POST /api/admin/users/:id/hand-over`: transfer every agent to one person, or suspend them all. */
export const handOverSchema = z.object({
  action: z.enum(['transfer', 'suspend'], { error: 'action must be "transfer" or "suspend"' }),
  toUserId: z.string({ error: 'toUserId is required' }).optional(),
  dryRun: z.boolean({ error: 'dryRun must be a boolean' }).optional()
}).superRefine((body, ctx) => {
  if (body.action === 'transfer' && !body.toUserId) {
    ctx.addIssue({ code: 'custom', path: ['toUserId'], message: 'toUserId is required' })
  }
})
