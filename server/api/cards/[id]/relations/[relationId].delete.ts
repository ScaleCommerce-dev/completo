import { and, eq, or } from 'drizzle-orm'

/** Remove a relation, from either of its two cards. */
export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)
  const relationId = getRouterParam(event, 'relationId')!
  const rel = db.select().from(schema.cardRelations).where(and(
    eq(schema.cardRelations.id, relationId),
    or(eq(schema.cardRelations.fromCardId, card.id), eq(schema.cardRelations.toCardId, card.id))
  )).get()
  if (!rel) throw createError({ statusCode: 404, message: 'Relation not found' })

  db.transaction(() => {
    recordCardEvents(user, relationChanges(rel, false))
    db.delete(schema.cardRelations).where(eq(schema.cardRelations.id, rel.id)).run()
  })

  for (const id of [rel.fromCardId, rel.toCardId]) {
    const c = db.select({ projectId: schema.cards.projectId }).from(schema.cards).where(eq(schema.cards.id, id)).get()
    if (c) emitCardChange(id, c.projectId)
  }
  return { ok: true }
})
