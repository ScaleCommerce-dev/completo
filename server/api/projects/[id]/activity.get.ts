import { and, desc, eq, inArray, sql } from 'drizzle-orm'

/** Card history fields that belong in a project's feed; the rest stay on the card. */
const CARD_FIELDS = ['status', 'blocks', 'blockedBy', 'relates'] as const
const RELATION_NAME = { blocks: 'blocks', blockedBy: 'blocked_by', relates: 'relates' } as const
const LIMIT = 100

interface FeedItem {
  id: string
  source: 'project' | 'card'
  /** A project activity type, or `created`, `status`, `relation_added`, `relation_removed` for a card. */
  type: string
  data: Record<string, unknown>
  createdAt: Date
  actor: UserRef | null
  /** The card a `card` item is about. */
  card?: CardRef
}

/**
 * A project's activity: what happened to the project itself (state, lead,
 * dates, members, milestones) merged with what happened to its cards (created,
 * moved between statuses, related to other cards), newest first, at most 100.
 * A card in another project the viewer cannot read shows its id only
 * (`cardRefs`).
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)

  const projectRows = db.select({ row: schema.projectActivity, actor: userRefColumns() })
    .from(schema.projectActivity)
    .leftJoin(schema.users, eq(schema.projectActivity.actorId, schema.users.id))
    .where(eq(schema.projectActivity.projectId, project.id))
    .orderBy(desc(schema.projectActivity.createdAt), sql`project_activity.rowid desc`)
    .limit(LIMIT).all()

  const eventRows = db.select({ row: schema.cardEvents, actor: userRefColumns() })
    .from(schema.cardEvents)
    .innerJoin(schema.cards, eq(schema.cardEvents.cardId, schema.cards.id))
    .leftJoin(schema.users, eq(schema.cardEvents.actorId, schema.users.id))
    .where(and(eq(schema.cards.projectId, project.id), inArray(schema.cardEvents.field, [...CARD_FIELDS])))
    .orderBy(desc(schema.cardEvents.id))
    .limit(LIMIT).all()

  // A card's creation is read off the card, as its own history does.
  const createdRows = db.select({ id: schema.cards.id, createdAt: schema.cards.createdAt, actor: userRefColumns() })
    .from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.createdById, schema.users.id))
    .where(eq(schema.cards.projectId, project.id))
    .orderBy(desc(schema.cards.createdAt), desc(schema.cards.id))
    .limit(LIMIT).all()

  const otherId = (r: typeof schema.cardEvents.$inferSelect) => Number(r.toId ?? r.fromId)
  const refIds = new Set<number>([...eventRows.map(r => r.row.cardId), ...createdRows.map(r => r.id)])
  for (const { row } of eventRows) if (row.field !== 'status') refIds.add(otherId(row))
  const refs = cardRefs([...refIds], visibleProjectIds(user))
  const statusNames = new Map(db.select({ id: schema.statuses.id, name: schema.statuses.name }).from(schema.statuses)
    .where(eq(schema.statuses.projectId, project.id)).all().map(s => [s.id, s.name]))
  const { ref } = createUserRefs([...projectRows, ...eventRows, ...createdRows].map(r => r.actor?.id ? r.actor : null))
  const actorOf = (a: { id: string | null } | null) => a?.id ? ref(a as Parameters<typeof ref>[0]) : null

  const fromProject: FeedItem[] = projectRows.map(r => ({
    id: r.row.id,
    source: 'project',
    type: r.row.type,
    data: r.row.data ? JSON.parse(r.row.data) as Record<string, unknown> : {},
    createdAt: r.row.createdAt,
    actor: actorOf(r.actor)
  }))

  const fromEvents: FeedItem[] = eventRows.map(({ row, actor }) => {
    const card = refs.get(row.cardId) ?? { id: row.cardId, hidden: true as const }
    if (row.field === 'status') {
      const name = (id: string | null, value: string | null) => (id && statusNames.get(id)) ?? value
      return { id: `event-${row.id}`, source: 'card', type: 'status', data: { from: name(row.fromId, row.fromValue), to: name(row.toId, row.toValue) }, createdAt: row.createdAt, actor: actorOf(actor), card }
    }
    const other = otherId(row)
    return {
      id: `event-${row.id}`,
      source: 'card',
      type: row.toId ? 'relation_added' : 'relation_removed',
      data: { relation: RELATION_NAME[row.field as keyof typeof RELATION_NAME], cardId: other, cardIdRef: refs.get(other) ?? { id: other, hidden: true } },
      createdAt: row.createdAt,
      actor: actorOf(actor),
      card
    }
  })

  const fromCreation: FeedItem[] = createdRows.map(r => ({
    id: `created-${r.id}`,
    source: 'card',
    type: 'created',
    data: {},
    createdAt: r.createdAt,
    actor: actorOf(r.actor),
    card: refs.get(r.id) ?? { id: r.id, hidden: true as const }
  }))

  // Each list is newest first; a stable sort keeps each list's own order within
  // the same instant, and a creation sorts after a change made in its second.
  return [...fromProject, ...fromEvents, ...fromCreation]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, LIMIT)
})
