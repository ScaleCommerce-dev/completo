import type { H3Event } from 'h3'
import type { z } from 'zod'

/**
 * The request body, parsed by a schema from `shared/schemas/`, or a 400 carrying
 * the first issue's message.
 *
 * `readValidatedBody` with `schema.parse` would do the parsing, but h3 wraps
 * whatever the validator throws as the error's `data` and says "Validation Error",
 * so a client would see a serialised error object instead of "Priority must be
 * low, medium, high or urgent". The schemas carry their own messages for that
 * reason. A missing or non-JSON body fails the same way, as "must be a JSON
 * object", instead of reaching the handler as `undefined`.
 */
export async function readBodyAs<S extends z.ZodType>(event: H3Event, schema: S): Promise<z.output<S>> {
  const body = await readBody(event).catch(() => undefined)
  const result = schema.safeParse(body)
  if (result.success) return result.data
  const issue = result.error.issues[0]!
  const message = issue.path.length === 0 && issue.code === 'invalid_type'
    ? 'Request body must be a JSON object'
    : issue.message
  throw createError({
    statusCode: 400,
    message,
    data: { issues: result.error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message })) }
  })
}
