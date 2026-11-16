import { z } from 'zod'

/**
 * `POST /api/projects/:id/members`: an existing user by id, or anyone by email
 * (an unknown address becomes an invitation). One of the two is required.
 */
export const memberAddSchema = z.object({
  userId: z.string({ error: 'userId must be a user id' }).optional(),
  email: z.string({ error: 'email must be text' }).optional()
}).refine(b => !!b.userId || !!b.email, { error: 'userId or email is required' })

/** `PATCH /api/projects/:id/members/:userId`. */
export const memberRoleSchema = z.object({
  role: z.enum(['owner', 'member'], { error: 'Role must be "owner" or "member"' })
})
