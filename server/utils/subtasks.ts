import { eq, inArray } from 'drizzle-orm'

/**
 * Sub-tasks: a card whose `parentId` names another card of the same project.
 *
 * Three rules, all enforced here and nowhere else:
 *
 * - **Same project.** A parent in another project would need every reference to
 *   hide what the viewer cannot read, and progress would count cards they cannot
 *   see. Nothing asked for that, so the parent must share the card's project.
 * - **One level.** A parent has no parent, and a card with sub-tasks cannot
 *   become one. That makes a cycle impossible without walking a chain.
 * - **A parent cannot enter Done while a sub-task is open.** Open means "not in
 *   the project's done status"; a project without one has no rule. The rule
 *   guards the *move*, not the state: reopening a sub-task of a done parent,
 *   adding one to it, deleting a status into Done or changing which status is
 *   Done all stay allowed, and the parent's progress shows the difference.
 */

type CardRow = typeof schema.cards.$inferSelect

/** `KEY-42` for each card, as the board shows it. */
export function cardTickets(cardIds: number[]): Map<number, string> {
  if (!cardIds.length) return new Map()
  const rows = db.select({ id: schema.cards.id, key: schema.projects.key })
    .from(schema.cards)
    .innerJoin(schema.projects, eq(schema.cards.projectId, schema.projects.id))
    .where(inArray(schema.cards.id, [...new Set(cardIds)]))
    .all()
  return new Map(rows.map(r => [r.id, `${r.key || 'TK'}-${r.id}`]))
}

/**
 * The card a sub-task may hang under, or a 400 saying why not. `cardId` is the
 * card being given a parent; absent when the card does not exist yet.
 */
export function requireParent(opts: { projectId: string, parentId: unknown, cardId?: number }): CardRow {
  const parentId = Number(opts.parentId)
  const parent = Number.isInteger(parentId)
    ? db.select().from(schema.cards).where(eq(schema.cards.id, parentId)).get()
    : undefined
  // One message for "no such card" and "a card of another project", so the
  // parent field cannot be used to probe which ids exist elsewhere.
  if (!parent || parent.projectId !== opts.projectId) {
    throw createError({ statusCode: 400, message: 'Parent card not found in this project' })
  }
  if (opts.cardId !== undefined && parent.id === opts.cardId) {
    throw createError({ statusCode: 400, message: 'A card cannot be its own parent' })
  }
  const tickets = cardTickets([parent.id, ...(opts.cardId !== undefined ? [opts.cardId] : [])])
  if (parent.parentId !== null) {
    throw createError({ statusCode: 400, message: `${tickets.get(parent.id)} is a sub-task itself, and sub-tasks have one level` })
  }
  if (opts.cardId !== undefined) {
    const child = db.select({ id: schema.cards.id }).from(schema.cards)
      .where(eq(schema.cards.parentId, opts.cardId)).get()
    if (child) {
      throw createError({ statusCode: 400, message: `${tickets.get(opts.cardId)} has sub-tasks of its own, so it cannot become a sub-task` })
    }
  }
  return parent
}

/** Sub-tasks of `parentId` that are not in the project's done status. Empty when the project has none. */
export function openSubtaskIds(parentId: number, projectId: string): number[] {
  const project = db.select({ doneStatusId: schema.projects.doneStatusId }).from(schema.projects)
    .where(eq(schema.projects.id, projectId)).get()
  if (!project?.doneStatusId) return []
  return db.select({ id: schema.cards.id, statusId: schema.cards.statusId }).from(schema.cards)
    .where(eq(schema.cards.parentId, parentId))
    .all()
    .filter(c => c.statusId !== project.doneStatusId)
    .map(c => c.id)
    .sort((a, b) => a - b)
}

/**
 * Refuse moving `card` into its project's done status while it has open
 * sub-tasks. A 409, because the request is well-formed and the card's state is
 * what refuses it; `data.openSubtasks` lists them so an agent can act on it.
 */
export function assertCanEnterStatus(card: Pick<CardRow, 'id' | 'projectId' | 'statusId'>, toStatusId: string): void {
  if (toStatusId === card.statusId) return
  const project = db.select({ doneStatusId: schema.projects.doneStatusId }).from(schema.projects)
    .where(eq(schema.projects.id, card.projectId)).get()
  if (!project?.doneStatusId || toStatusId !== project.doneStatusId) return
  const open = openSubtaskIds(card.id, card.projectId)
  if (!open.length) return
  const tickets = cardTickets([card.id, ...open])
  const list = open.map(id => tickets.get(id)!)
  const status = db.select({ name: schema.statuses.name }).from(schema.statuses)
    .where(eq(schema.statuses.id, toStatusId)).get()
  throw createError({
    statusCode: 409,
    message: `${tickets.get(card.id)} has ${open.length} open sub-task${open.length === 1 ? '' : 's'} (${list.join(', ')}). Finish or detach ${open.length === 1 ? 'it' : 'them'} before moving it to ${status?.name ?? 'Done'}.`,
    data: { openSubtasks: list }
  })
}

export interface SubtaskProgress {
  total: number
  done: number
}

/** For each card that has sub-tasks, how many it has and how many are in its project's done status. */
export function subtaskProgress(cardIds: number[]): Map<number, SubtaskProgress> {
  const out = new Map<number, SubtaskProgress>()
  if (!cardIds.length) return out
  const rows = db.select({ parentId: schema.cards.parentId, statusId: schema.cards.statusId, doneStatusId: schema.projects.doneStatusId })
    .from(schema.cards)
    .innerJoin(schema.projects, eq(schema.cards.projectId, schema.projects.id))
    .where(inArray(schema.cards.parentId, cardIds))
    .all()
  for (const r of rows) {
    const p = out.get(r.parentId!) ?? { total: 0, done: 0 }
    p.total++
    if (r.doneStatusId && r.statusId === r.doneStatusId) p.done++
    out.set(r.parentId!, p)
  }
  return out
}

/** What a sub-task's card names its parent by: the parent's id and title. */
export function parentRefs(parentIds: number[]): Map<number, { id: number, title: string }> {
  const ids = [...new Set(parentIds)]
  if (!ids.length) return new Map()
  const rows = db.select({ id: schema.cards.id, title: schema.cards.title }).from(schema.cards)
    .where(inArray(schema.cards.id, ids)).all()
  return new Map(rows.map(r => [r.id, r]))
}

/**
 * The history of a parent change, on all three cards it touches: the sub-task
 * records its parent, and each parent records the sub-task it gained or lost.
 */
export function parentChanges(childId: number, fromParentId: number | null, toParentId: number | null): CardChange[] {
  if (fromParentId === toParentId) return []
  const tickets = cardTickets([childId, ...(fromParentId ? [fromParentId] : []), ...(toParentId ? [toParentId] : [])])
  const side = (id: number | null) => (id ? { id: String(id), value: tickets.get(id) ?? `#${id}` } : null)
  const changes: CardChange[] = [{ cardId: childId, field: 'parent', from: side(fromParentId), to: side(toParentId) }]
  if (fromParentId) changes.push({ cardId: fromParentId, field: 'subtask', from: side(childId) })
  if (toParentId) changes.push({ cardId: toParentId, field: 'subtask', to: side(childId) })
  return changes
}

/**
 * Deleting a card changes others through the foreign key, which no handler
 * writes: its sub-tasks lose their parent (`set null`), and its parent loses a
 * sub-task. Call it just before the delete, in the same transaction.
 */
export function recordCardRemoval(actor: HistoryActor, card: Pick<CardRow, 'id' | 'parentId'>): void {
  const children = db.select({ id: schema.cards.id }).from(schema.cards)
    .where(eq(schema.cards.parentId, card.id)).all()
  const changes = children.flatMap(c => parentChanges(c.id, card.id, null).filter(ch => ch.cardId === c.id))
  if (card.parentId) changes.push(...parentChanges(card.id, card.parentId, null).filter(ch => ch.cardId === card.parentId))
  recordCardEvents(actor, changes)
}

/** The sub-tasks of a card, in the order they were created, for its panel. */
export function subtasksOf(parentId: number) {
  return db.select({
    id: schema.cards.id,
    title: schema.cards.title,
    statusId: schema.cards.statusId,
    assigneeId: schema.cards.assigneeId,
    priority: schema.cards.priority
  }).from(schema.cards)
    .where(eq(schema.cards.parentId, parentId))
    .orderBy(schema.cards.id)
    .all()
}
