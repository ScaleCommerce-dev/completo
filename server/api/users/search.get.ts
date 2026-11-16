import { and, or, eq, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  const query = getQuery(event)
  const q = (query.q as string || '').trim()

  if (!q || q.length < 2) {
    return []
  }

  const users = db.select(userRefColumns())
    .from(schema.users)
    .where(and(
      likeContains(schema.users.name, q),
      // A suspended agent is left out of every picker.
      or(eq(schema.users.kind, 'human'), isNull(schema.users.suspendedAt))
    ))
    .limit(10)
    .all()

  const { ref } = createUserRefs(users)
  return users.map(u => ref(u))
})
