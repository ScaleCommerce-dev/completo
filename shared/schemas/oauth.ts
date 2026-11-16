import { z } from 'zod'

/**
 * `POST /api/oauth/authorize`, the consent page's decision. Only `decision` is
 * parsed here: the OAuth parameters travel through untouched (a loose object),
 * because `parseAuthorizeRequest` has to tell a redirectable error from one that
 * must not leave the server, and a schema would answer both with the same 400.
 * Left out, the decision is a denial.
 */
export const consentSchema = z.looseObject({
  decision: z.enum(['allow', 'deny'], { error: 'decision must be "allow" or "deny"' }).optional()
})
