import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const query = getQuery(event)
  const scope = query.scope as string | undefined

  if (scope && scope !== 'card' && scope !== 'board') {
    throw createError({ statusCode: 400, message: 'Scope must be "card" or "board"' })
  }

  const columns = {
    id: schema.aiSkills.id,
    name: schema.aiSkills.name,
    scope: schema.aiSkills.scope,
    position: schema.aiSkills.position
  }

  if (scope) {
    return db.select(columns).from(schema.aiSkills).where(eq(schema.aiSkills.scope, scope as 'card' | 'board')).orderBy(asc(schema.aiSkills.position)).all()
  }

  return db.select(columns).from(schema.aiSkills).orderBy(asc(schema.aiSkills.position)).all()
})
