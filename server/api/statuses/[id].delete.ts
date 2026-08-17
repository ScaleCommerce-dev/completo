import { eq } from 'drizzle-orm'

/**
 * Deleting a status moves its cards. It never deletes them.
 *
 * `cards.statusId` is `onDelete: 'cascade'`, so this handler used to be one
 * `db.delete` that took every card in the status with it — reachable from a
 * one-click popover row and advertised on a public endpoint as "cascades to
 * cards". Cards belong to the *project* (`cards.projectId`), not to the status,
 * and removing a board column already unlinks a status without touching a card,
 * so reorganising a project's states is not a reason to lose work.
 *
 * Three cases, and they are enforced here rather than in `StatusManager` because
 * this endpoint is public API (`server/assets/openapi.json`):
 *
 *   no cards          — delete.
 *   cards, no target  — 409 carrying the count, so a caller can ask where they go.
 *   cards + target    — reassign, then delete.
 *
 * **The FK cascade stays.** Deleting a *project* reaches its cards through both
 * `projectId` and `statusId` and SQLite orders neither, so turning this one into
 * RESTRICT would make project deletion fail depending on which fired first. The
 * cascade is the integrity net; this handler is the rule. That is why the guard
 * below looks redundant with the schema and is not.
 */
export default defineEventHandler(async (event) => {
  const { status } = await resolveStatus(event)

  // A DELETE may legitimately arrive with no body at all — the empty-status case
  // needs none — so both spellings are accepted and neither is required.
  const body = await readBody<{ moveToStatusId?: string } | undefined>(event).catch(() => undefined)
  const moveToStatusId = body?.moveToStatusId ?? getQuery(event).moveToStatusId as string | undefined

  const siblings = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, status.projectId))
    .all()
    .filter(s => s.id !== status.id)

  // With no statuses left a card cannot be created at all (the CLI and the create
  // endpoints both need one), and there would be nowhere for cards to go.
  if (siblings.length === 0) {
    throw createError({ statusCode: 409, message: 'A project needs at least one status' })
  }

  const cards = db.select().from(schema.cards)
    .where(eq(schema.cards.statusId, status.id))
    .all()
    .sort((a, b) => a.position - b.position)

  if (cards.length === 0) {
    db.delete(schema.statuses).where(eq(schema.statuses.id, status.id)).run()
    return { ok: true, movedCards: 0, movedToStatusId: null }
  }

  if (!moveToStatusId) {
    throw createError({
      statusCode: 409,
      message: `"${status.name}" holds ${cards.length} card${cards.length === 1 ? '' : 's'}. Pass moveToStatusId to move them to another status.`,
      data: { cardCount: cards.length }
    })
  }

  const target = siblings.find(s => s.id === moveToStatusId)
  if (!target) {
    throw createError({ statusCode: 400, message: 'moveToStatusId must be another status in this project' })
  }

  db.transaction(() => {
    // Append after the target's existing cards, `max + 1` upward — reusing the
    // source positions would land two cards on one position in the target.
    const existing = db.select({ position: schema.cards.position }).from(schema.cards)
      .where(eq(schema.cards.statusId, target.id))
      .all()
    let position = existing.reduce((max, c) => Math.max(max, c.position), -1) + 1

    for (const card of cards) {
      db.update(schema.cards)
        // The card's status changed, so `updatedAt` moves — same as a manual move.
        .set({ statusId: target.id, position: position++, updatedAt: new Date() })
        .where(eq(schema.cards.id, card.id))
        .run()
    }

    db.delete(schema.statuses).where(eq(schema.statuses.id, status.id)).run()
  })

  return { ok: true, movedCards: cards.length, movedToStatusId: target.id }
})
