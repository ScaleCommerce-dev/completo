import { and, eq } from 'drizzle-orm'

/**
 * Link two cards. `blocks` and `blocked_by` are one stored direction read from
 * either end; `relates` is stored once and refused again in either direction.
 * The other card must be in a project the caller can read.
 */
export default defineEventHandler(async (event) => {
  const { user, card } = await resolveCard(event)
  const { type, cardId } = await readBody<{ type?: RelationKind, cardId?: number }>(event) ?? {}

  if (!type || !RELATION_KINDS.includes(type)) {
    throw createError({ statusCode: 400, message: `type must be one of ${RELATION_KINDS.join(', ')}` })
  }
  const visible = visibleProjectIds(user)
  const other = requireVisibleCard(cardId, visible, 'Card')
  if (other.id === card.id) {
    throw createError({ statusCode: 400, message: 'A card cannot relate to itself' })
  }

  const stored = type === 'blocked_by'
    ? { type: 'blocks' as const, fromCardId: other.id, toCardId: card.id }
    : { type, fromCardId: card.id, toCardId: other.id }

  const exists = (from: number, to: number) => db.select().from(schema.cardRelations).where(and(
    eq(schema.cardRelations.type, stored.type),
    eq(schema.cardRelations.fromCardId, from),
    eq(schema.cardRelations.toCardId, to)
  )).get()
  if (exists(stored.fromCardId, stored.toCardId) || (stored.type === 'relates' && exists(stored.toCardId, stored.fromCardId))) {
    throw createError({ statusCode: 409, message: 'These cards are already related this way' })
  }

  const row = db.transaction(() => {
    const r = db.insert(schema.cardRelations).values({ ...stored, createdById: user.id }).returning().get()
    recordCardEvents(user, relationChanges(r, true))
    return r
  })

  emitCardChange(card.id, card.projectId)
  emitCardChange(other.id, other.projectId)

  setResponseStatus(event, 201)
  return row
})
