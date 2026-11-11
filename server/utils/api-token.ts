import { createHash, randomBytes } from 'node:crypto'
import { eq, count } from 'drizzle-orm'

const TOKEN_PREFIX = 'dzo_'

export const API_TOKEN_LIMIT = 25

export function generateApiToken(): { rawToken: string, tokenHash: string, tokenPrefix: string } {
  const bytes = randomBytes(32)
  const rawToken = TOKEN_PREFIX + bytes.toString('base64url')
  return {
    rawToken,
    tokenHash: hashApiToken(rawToken),
    tokenPrefix: rawToken.slice(0, 8)
  }
}

export function hashApiToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/**
 * Validate a token request and create the token for `userId`: the one path behind
 * `POST /api/user/tokens` and an agent's `POST /api/agents/:id/tokens`, which
 * differ only in who may ask. The raw token is in the return value and nowhere else.
 */
export function mintApiToken(userId: string, { name, expiresInDays }: { name?: string, expiresInDays?: number }) {
  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: 'Token name is required' })
  }

  if (name.trim().length > 100) {
    throw createError({ statusCode: 400, message: 'Token name must be 100 characters or less' })
  }

  if (expiresInDays !== undefined && (typeof expiresInDays !== 'number' || expiresInDays <= 0)) {
    throw createError({ statusCode: 400, message: 'Expiry must be a positive number of days' })
  }

  const { total } = db.select({ total: count() })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, userId))
    .get()!

  if (total >= API_TOKEN_LIMIT) {
    throw createError({ statusCode: 400, message: `Maximum of ${API_TOKEN_LIMIT} API tokens allowed` })
  }

  const { rawToken, tokenHash, tokenPrefix } = generateApiToken()

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null

  const id = crypto.randomUUID()
  const now = new Date()

  db.insert(schema.apiTokens).values({
    id,
    userId,
    name: name.trim(),
    tokenHash,
    tokenPrefix,
    expiresAt,
    createdAt: now
  }).run()

  return {
    id,
    name: name.trim(),
    token: rawToken,
    tokenPrefix,
    expiresAt,
    createdAt: now
  }
}
