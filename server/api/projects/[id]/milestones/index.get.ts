import { and, asc, eq, isNull } from 'drizzle-orm'

/** A project's milestones in order, each with its progress (`progressOf`). */
export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event)
  const milestones = db.select().from(schema.milestones)
    .where(eq(schema.milestones.projectId, project.id))
    .orderBy(asc(schema.milestones.position), asc(schema.milestones.createdAt)).all()
  const cards = db.select({ milestoneId: schema.cards.milestoneId, category: schema.statuses.category })
    .from(schema.cards)
    .innerJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(and(eq(schema.cards.projectId, project.id), isNull(schema.cards.archivedAt))).all()
  return milestones.map((m) => {
    const { scope, completed } = progressOf(cards.filter(c => c.milestoneId === m.id).map(c => c.category))
    return { ...m, total: scope, completed }
  })
})
