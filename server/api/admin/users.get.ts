import { desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await requireAdmin(event)

  const users = db.select({
    id: schema.users.id,
    email: schema.users.email,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl,
    isAdmin: schema.users.isAdmin,
    suspendedAt: schema.users.suspendedAt,
    lastSeenAt: schema.users.lastSeenAt,
    createdAt: schema.users.createdAt,
    passwordHash: schema.users.passwordHash,
    emailVerifiedAt: schema.users.emailVerifiedAt
  })
    .from(schema.users)
    .orderBy(desc(schema.users.createdAt))
    .all()

  return users.map(({ passwordHash, emailVerifiedAt, ...rest }) => ({
    ...rest,
    pendingSetup: passwordHash === '!invited' && !emailVerifiedAt
  }))
})
