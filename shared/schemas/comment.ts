import { z } from 'zod'

const COMMENT_REQUIRED = 'Comment body is required'

/** `POST /api/cards/:id/comments` and `PUT /api/comments/:id`: the text, stored trimmed. */
export const commentSchema = z.object({
  body: z.string({ error: COMMENT_REQUIRED }).trim().min(1, { error: COMMENT_REQUIRED })
})
