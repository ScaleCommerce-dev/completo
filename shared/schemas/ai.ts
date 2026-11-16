import { z } from 'zod'

/**
 * The AI endpoints' bodies: shapes only. The length caps stay in
 * `AI_INPUT_LIMITS` / `assertAiInputLength` (`server/utils/ai.ts`), the one place
 * they are spelled, and the handlers apply them after this parse. Optional fields
 * are nullish because the client sends whatever the card has, including null.
 */
const optionalText = (field: string) => z.string({ error: `${field} must be text` }).nullish()

const shared = {
  skillId: z.string({ error: 'skillId must be a skill id' }).nullish(),
  userPrompt: optionalText('Prompt'),
  pageUrl: optionalText('pageUrl')
}

/** `POST /api/projects/:id/ai/generate-description`. */
export const aiDescriptionSchema = z.object({
  ...shared,
  title: z.string({ error: 'Title is required' }).trim().min(1, { error: 'Title is required' }),
  description: optionalText('Description'),
  tags: z.array(z.string({ error: 'Tags must be a list of names' }), { error: 'Tags must be a list of names' }).nullish(),
  priority: optionalText('Priority'),
  mode: z.enum(['generate', 'improve'], { error: 'Mode must be "generate" or "improve"' }).nullish()
})

/** `POST /api/cards/:id/ai/comment`: the draft being written. */
export const aiCommentSchema = z.object({
  ...shared,
  body: z.string({ error: 'Comment body is required' }).trim().min(1, { error: 'Comment body is required' })
})
