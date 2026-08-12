import { eq, asc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  if (!user) {
    throw createError({ statusCode: 401, message: 'Unauthorized' })
  }

  const query = getQuery(event)
  const rawScope = query.scope as string | undefined

  let scope: AiSkillScope | undefined
  if (rawScope !== undefined) {
    if (!isAiSkillScope(rawScope)) {
      throw createError({ statusCode: 400, message: `Scope must be one of: ${AI_SKILL_SCOPES.join(', ')}` })
    }
    scope = rawScope
  }

  const columns = {
    id: schema.aiSkills.id,
    name: schema.aiSkills.name,
    scope: schema.aiSkills.scope,
    position: schema.aiSkills.position
  }

  if (scope) {
    return db.select(columns).from(schema.aiSkills).where(eq(schema.aiSkills.scope, scope)).orderBy(asc(schema.aiSkills.position)).all()
  }

  return db.select(columns).from(schema.aiSkills).orderBy(asc(schema.aiSkills.position)).all()
})
