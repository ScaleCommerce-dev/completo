import { and, eq, like, or } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const q = (query.q as string || '').trim()

  if (!q || q.length < 2) {
    return []
  }

  const { project } = await resolveProject(event)

  const escaped = q.replace(/[%_]/g, '\\$&')
  const conditions = [
    and(
      eq(schema.cards.projectId, project.id),
      like(schema.cards.title, `%${escaped}%`)
    )
  ]

  // Also match by card ID if the query looks numeric (e.g. "42" or "TK-42")
  const numMatch = q.match(/^(?:\w+-)?(\d+)$/)
  if (numMatch) {
    conditions.push(
      and(
        eq(schema.cards.projectId, project.id),
        eq(schema.cards.id, Number(numMatch[1]))
      )
    )
  }

  const results = db.select({
    id: schema.cards.id,
    title: schema.cards.title,
    priority: schema.cards.priority
  })
    .from(schema.cards)
    .where(or(...conditions))
    .limit(10)
    .all()

  return results
})
