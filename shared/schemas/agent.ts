import { z } from 'zod'
import { isHexColor } from '../utils/colors'
import { somethingToUpdate } from './common'

/**
 * Agent request bodies. The shape of an agent's editable fields lives here; that
 * no other agent has the name, and every membership and manager rule, need the
 * database and stay in `server/utils/agents.ts`.
 */

const name = z.string({ error: 'Name is required' }).trim()
  .min(1, { error: 'Name is required' })
  .max(100, { error: 'Name must be 100 characters or less' })

/** Blank is stored as no description. */
const description = z.string({ error: 'Description must be a string' }).trim()
  .max(500, { error: 'Description must be 500 characters or less' })
  .transform(d => d || null)
  .nullable()

const color = z.string({ error: 'Colour must be a hex value like #f97316' })
  .refine(isHexColor, { error: 'Colour must be a hex value like #f97316' })
  .transform(c => c.toLowerCase())
  .nullable()

/** `POST /api/agents`. */
export const agentCreateSchema = z.object({
  name,
  description: description.optional(),
  color: color.optional()
})

/** `PATCH /api/agents/:id`. */
export const agentUpdateSchema = z.object({
  name: name.optional(),
  description: description.optional(),
  color: color.optional()
}).refine(somethingToUpdate, { error: 'No valid fields to update' })

export type AgentFields = z.output<typeof agentUpdateSchema>

const agentIds = z.array(
  z.string({ error: 'agentIds must be a non-empty array of ids' }),
  { error: 'agentIds must be a non-empty array of ids' }
).min(1, { error: 'agentIds must be a non-empty array of ids' })

const toUserId = z.string({ error: 'toUserId is required' }).min(1, { error: 'toUserId is required' })
const dryRun = z.boolean({ error: 'dryRun must be a boolean' }).optional()

/** `POST /api/agents/suspend`. */
export const agentSuspendSchema = z.object({ agentIds })

/** `POST /api/agents/transfer`. */
export const agentsTransferSchema = z.object({ agentIds, toUserId, dryRun })

/** `POST /api/agents/:id/transfer`. */
export const agentTransferSchema = z.object({ toUserId, dryRun })
