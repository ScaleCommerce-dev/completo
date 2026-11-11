import { and, or, eq, isNull, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  const query = getQuery(event)
  const q = (query.q as string || '').trim()

  if (!q || q.length < 2) {
    return []
  }

  // `%`, `_` and the escape itself stay literal; SQLite's LIKE has no escape
  // character unless ESCAPE names one (see `agentSearchCondition`).
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const users = db.select(userRefColumns())
    .from(schema.users)
    .where(and(
      sql`${schema.users.name} LIKE ${pattern} ESCAPE '\\'`,
      // A suspended agent is left out of every picker.
      or(eq(schema.users.kind, 'human'), isNull(schema.users.suspendedAt))
    ))
    .limit(10)
    .all()

  const { ref } = createUserRefs(users)
  return users.map(u => ref(u))
})
