import { and, asc, count, desc, eq, gt, inArray, lt } from 'drizzle-orm'

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 500

interface HistoryEntry {
  /** 0 for the creation, which is read off the card and has no row. */
  id: number
  field: CardHistoryField | 'created'
  from: { id: string | null, value: string } | null
  to: { id: string | null, value: string } | null
  /** Null once the account is gone; `actorName` still says who it was. */
  actor: UserRef | null
  actorName: string | null
  createdAt: Date
}

/**
 * A card's history, oldest first, newest page first.
 *
 * Bounded rather than whole: a card an agent works on can collect hundreds of
 * changes. `before` takes the oldest id of the previous page; `hasMore` says
 * whether there is anything before this one, and `total` how many entries the
 * whole history has, so a count need not load every page. The card's creation
 * is the first entry of the last page, read off the card itself (see
 * `cardEvents` in schema.ts), and counts as one.
 *
 * `after` reads forward instead: the entries newer than that id, oldest first,
 * with `hasMore` saying whether newer ones remain. It is how an open timeline
 * fetches only what is new, and never repeats the creation, which is the start
 * rather than news. `projectId` names the stream that says when to ask.
 *
 * A side that names a status, person or tag reads by the name it has now, and
 * by the name stored with the event once that row is gone.
 */
export default defineEventHandler(async (event) => {
  const { card } = await resolveCard(event)
  const query = getQuery(event)

  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw createError({ statusCode: 400, message: `limit must be an integer from 1 to ${MAX_LIMIT}` })
  }
  const before = query.before === undefined ? null : Number(query.before)
  if (before !== null && (!Number.isInteger(before) || before < 1)) {
    throw createError({ statusCode: 400, message: 'before must be an event id' })
  }
  const after = query.after === undefined ? null : Number(query.after)
  if (after !== null && (!Number.isInteger(after) || after < 0)) {
    throw createError({ statusCode: 400, message: 'after must be an event id, or 0' })
  }
  if (after !== null && before !== null) {
    throw createError({ statusCode: 400, message: 'Pass before or after, not both' })
  }

  const rows = db.select({ event: schema.cardEvents, actor: userRefColumns() })
    .from(schema.cardEvents)
    .leftJoin(schema.users, eq(schema.cardEvents.actorId, schema.users.id))
    .where(and(
      eq(schema.cardEvents.cardId, card.id),
      before !== null ? lt(schema.cardEvents.id, before) : undefined,
      after !== null ? gt(schema.cardEvents.id, after) : undefined
    ))
    // The id, not the timestamp: it is the order the changes were made in.
    .orderBy(after !== null ? asc(schema.cardEvents.id) : desc(schema.cardEvents.id))
    .limit(limit + 1)
    .all()
  const hasMore = rows.length > limit
  const page = after !== null ? rows.slice(0, limit) : rows.slice(0, limit).reverse()
  const reachesStart = after === null && !hasMore

  // Current names for every row a side still points at, one query per kind.
  const idsOf = (fields: string[]) => [...new Set(page
    .filter(r => fields.includes(r.event.field))
    .flatMap(r => [r.event.fromId, r.event.toId])
    .filter((id): id is string => !!id))]
  const names = (table: typeof schema.statuses | typeof schema.tags | typeof schema.users, ids: string[]) => ids.length
    ? new Map(db.select({ id: table.id, name: table.name }).from(table).where(inArray(table.id, ids)).all().map(r => [r.id, r.name]))
    : new Map<string, string>()
  const current: Record<string, Map<string, string>> = {
    status: names(schema.statuses, idsOf(['status'])),
    assignee: names(schema.users, idsOf(['assignee'])),
    tag: names(schema.tags, idsOf(['tag']))
  }
  const side = (field: string, id: string | null, value: string | null) => {
    if (id === null && value === null) return null
    return { id, value: (id && current[field]?.get(id)) ?? value ?? '' }
  }

  const creator = reachesStart && card.createdById
    ? db.select(userRefColumns()).from(schema.users).where(eq(schema.users.id, card.createdById)).get() ?? null
    : null
  const { ref } = createUserRefs([...page.map(r => r.actor?.id ? r.actor : null), creator])

  const events: HistoryEntry[] = page.map(({ event: e, actor }) => ({
    id: e.id,
    field: e.field,
    from: side(e.field, e.fromId, e.fromValue),
    to: side(e.field, e.toId, e.toValue),
    actor: actor?.id ? ref(actor) : null,
    actorName: e.actorName,
    createdAt: e.createdAt
  }))

  if (reachesStart) {
    events.unshift({
      id: 0,
      field: 'created',
      from: null,
      to: null,
      actor: ref(creator),
      actorName: creator?.name ?? null,
      createdAt: card.createdAt
    })
  }

  const recorded = db.select({ n: count() }).from(schema.cardEvents).where(eq(schema.cardEvents.cardId, card.id)).get()?.n ?? 0

  return { events, hasMore, total: recorded + 1, projectId: card.projectId }
})
