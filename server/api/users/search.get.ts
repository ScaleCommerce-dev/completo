import { like } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  const query = getQuery(event)
  const q = (query.q as string || '').trim()

  if (!q || q.length < 2) {
    return []
  }

  const escaped = q.replace(/[%_]/g, '\\$&')
  const pattern = `%${escaped}%`
  const users = db.select({
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl
  })
    .from(schema.users)
    .where(like(schema.users.name, pattern))
    .limit(10)
    .all()

  return users
})
