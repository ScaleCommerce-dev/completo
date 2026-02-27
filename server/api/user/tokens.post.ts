import { eq, count } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const { name, expiresInDays } = await readBody<{ name?: string, expiresInDays?: number }>(event)

  if (!name?.trim()) {
    throw createError({ statusCode: 400, message: 'Token name is required' })
  }

  if (name.trim().length > 100) {
    throw createError({ statusCode: 400, message: 'Token name must be 100 characters or less' })
  }

  if (expiresInDays !== undefined && (typeof expiresInDays !== 'number' || expiresInDays <= 0)) {
    throw createError({ statusCode: 400, message: 'Expiry must be a positive number of days' })
  }

  const result = db.select({ total: count() })
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, session.user.id))
    .all()
  const { total } = result[0]!

  if (total >= 25) {
    throw createError({ statusCode: 400, message: 'Maximum of 25 API tokens allowed' })
  }

  const { rawToken, tokenHash, tokenPrefix } = generateApiToken()

  const expiresAt = expiresInDays
    ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
    : null

  const id = crypto.randomUUID()
  const now = new Date()

  db.insert(schema.apiTokens).values({
    id,
    userId: session.user.id,
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
})
