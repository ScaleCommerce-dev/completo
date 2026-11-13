import { and, eq, inArray, isNull, or } from 'drizzle-orm'

/**
 * Server half of the issue workflow: which cards a user may see in other
 * projects, the checks for parents, relations and milestones, and the project
 * activity feed's writer. A card's own history goes through `recordCardEvents`
 * (`server/utils/card-history.ts`) like every other change to a card.
 */

export function recordProjectActivity(projectId: string, actorId: string | null, type: ProjectActivityType, data?: Record<string, unknown>) {
  db.insert(schema.projectActivity).values({
    projectId,
    actorId,
    type,
    data: data ? JSON.stringify(data) : null,
    createdAt: new Date()
  }).run()
}

/** Projects the user may read. Admins read all, like `requireProjectMember`. */
export function visibleProjectIds(user: { id: string, isAdmin?: boolean | number | null }): Set<string> {
  if (user.isAdmin) {
    return new Set(db.select({ id: schema.projects.id }).from(schema.projects).all().map(p => p.id))
  }
  return new Set(db.select({ id: schema.projectMembers.projectId }).from(schema.projectMembers)
    .where(eq(schema.projectMembers.userId, user.id)).all().map(m => m.id))
}

/**
 * A card shown inside another card (parent, sub-issue, relation). A card in a
 * project the viewer cannot read shows its id only, so a relation never leaks a
 * title, status or project key across the project boundary.
 */
export interface CardRef {
  id: number
  hidden?: true
  title?: string
  projectId?: string
  /** The project's slug, for the card's address: a ref can sit in another project. */
  projectSlug?: string
  /** The ticket id, `KEY-42`. */
  ticket?: string
  status?: { id: string, name: string, category: StatusCategory, color: string | null }
  archivedAt?: Date | null
}

export function cardRefs(ids: number[], visible: Set<string>): Map<number, CardRef> {
  const out = new Map<number, CardRef>()
  if (ids.length === 0) return out
  const rows = db.select({ card: schema.cards, status: schema.statuses, key: schema.projects.key, slug: schema.projects.slug })
    .from(schema.cards)
    .innerJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .innerJoin(schema.projects, eq(schema.cards.projectId, schema.projects.id))
    .where(inArray(schema.cards.id, [...new Set(ids)])).all()
  for (const r of rows) {
    out.set(r.card.id, visible.has(r.card.projectId)
      ? {
          id: r.card.id,
          title: r.card.title,
          projectId: r.card.projectId,
          projectSlug: r.slug,
          ticket: `${r.key}-${r.card.id}`,
          status: { id: r.status.id, name: r.status.name, category: r.status.category, color: r.status.color },
          archivedAt: r.card.archivedAt
        }
      : { id: r.card.id, hidden: true })
  }
  return out
}

/** A card the caller may reference: it exists and lives in a project they can read. */
export function requireVisibleCard(cardId: unknown, visible: Set<string>, what: string) {
  const id = Number(cardId)
  const card = Number.isInteger(id) ? db.select().from(schema.cards).where(eq(schema.cards.id, id)).get() : undefined
  if (!card || !visible.has(card.projectId)) {
    throw createError({ statusCode: 400, message: `${what} not found` })
  }
  return card
}

/** Refuse a parent that is the card itself or one of its descendants. */
export function assertNoParentCycle(cardId: number, parentId: number) {
  let current: number | null = parentId
  const seen = new Set<number>()
  while (current !== null && !seen.has(current)) {
    if (current === cardId) {
      throw createError({ statusCode: 400, message: 'A card cannot be its own ancestor' })
    }
    seen.add(current)
    const row: { parentId: number | null } | undefined = db.select({ parentId: schema.cards.parentId }).from(schema.cards).where(eq(schema.cards.id, current)).get()
    current = row?.parentId ?? null
  }
}

export type RelationRef = CardRef & { relationId: string }
export interface CardRelations { blocks: RelationRef[], blockedBy: RelationRef[], relates: RelationRef[] }

export function relationRows(cardId: number) {
  return db.select().from(schema.cardRelations)
    .where(or(eq(schema.cardRelations.fromCardId, cardId), eq(schema.cardRelations.toCardId, cardId))).all()
}

/** Relations of one card, read from its side, each entry with its relation id. */
export function cardRelations(cardId: number, visible: Set<string>): CardRelations {
  const rows = relationRows(cardId)
  const other = (r: typeof rows[number]) => r.fromCardId === cardId ? r.toCardId : r.fromCardId
  const refs = cardRefs(rows.map(other), visible)
  const out: CardRelations = { blocks: [], blockedBy: [], relates: [] }
  for (const r of rows) {
    const ref = refs.get(other(r))
    if (!ref) continue
    const entry = { ...ref, relationId: r.id }
    if (r.type === 'relates') out.relates.push(entry)
    else if (r.fromCardId === cardId) out.blocks.push(entry)
    else out.blockedBy.push(entry)
  }
  return out
}

/** Sub-issues of each card, with how many of them are closed. */
export function childProgress(parentIds: number[]): Map<number, { total: number, completed: number }> {
  const out = new Map<number, { total: number, completed: number }>()
  if (parentIds.length === 0) return out
  const rows = db.select({ parentId: schema.cards.parentId, category: schema.statuses.category })
    .from(schema.cards)
    .innerJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(and(inArray(schema.cards.parentId, parentIds), isNull(schema.cards.archivedAt))).all()
  for (const r of rows) {
    const p = out.get(r.parentId!) ?? { total: 0, completed: 0 }
    p.total++
    if (CLOSED_CATEGORIES.includes(r.category)) p.completed++
    out.set(r.parentId!, p)
  }
  return out
}

/** A milestone of the given project, or a 400. */
export function requireProjectMilestone(milestoneId: string, projectId: string) {
  const m = db.select().from(schema.milestones)
    .where(and(eq(schema.milestones.id, milestoneId), eq(schema.milestones.projectId, projectId))).get()
  if (!m) throw createError({ statusCode: 400, message: 'Milestone does not belong to this project' })
  return m
}

/** One project activity row per field a project update actually changed. */
export function recordProjectChanges(before: typeof schema.projects.$inferSelect, after: typeof schema.projects.$inferSelect, actorId: string) {
  const userName = (id: string | null) => id ? db.select({ n: schema.users.name }).from(schema.users).where(eq(schema.users.id, id)).get()?.n ?? null : null
  for (const field of ['name', 'state', 'priority'] as const) {
    if (before[field] !== after[field]) recordProjectActivity(before.id, actorId, field, { from: before[field], to: after[field] })
  }
  // The text itself can be long; the feed says that it changed, not how.
  if ((before.description || null) !== (after.description || null)) recordProjectActivity(before.id, actorId, 'description')
  if (before.leadId !== after.leadId) {
    recordProjectActivity(before.id, actorId, 'lead', { from: userName(before.leadId), to: userName(after.leadId) })
  }
  for (const [date, res, type] of [['startDate', 'startDateResolution', 'start_date'], ['targetDate', 'targetDateResolution', 'target_date']] as const) {
    if (before[date] !== after[date] || before[res] !== after[res]) {
      recordProjectActivity(before.id, actorId, type, { from: before[date], fromResolution: before[res], to: after[date], toResolution: after[res] })
    }
  }
}

/** A project's lead is one of its members: whoever leaves stops leading it. */
export function clearProjectLead(projectId: string, userId: string) {
  db.update(schema.projects).set({ leadId: null })
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.leadId, userId))).run()
}
