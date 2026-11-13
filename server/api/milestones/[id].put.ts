import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, milestone } = await resolveMilestone(event)
  const { name, description, targetDate, position } = await readBody<{ name?: string, description?: string | null, targetDate?: string | null, position?: number }>(event) ?? {}
  if (name !== undefined && (typeof name !== 'string' || !name.trim())) throw createError({ statusCode: 400, message: 'Milestone name is required' })
  if (targetDate && (typeof targetDate !== 'string' || !isIsoDate(targetDate))) throw createError({ statusCode: 400, message: 'targetDate must be YYYY-MM-DD' })
  if (position !== undefined && (!Number.isInteger(position) || position < 0)) throw createError({ statusCode: 400, message: 'position must be a non-negative integer' })
  db.transaction(() => {
    db.update(schema.milestones).set({
      ...(name !== undefined && { name: name.trim() }),
      ...(description !== undefined && { description: description || null }),
      ...(targetDate !== undefined && { targetDate: targetDate || null }),
      ...(position !== undefined && { position })
    }).where(eq(schema.milestones.id, milestone.id)).run()
    if (name !== undefined && name.trim() !== milestone.name) {
      recordProjectActivity(milestone.projectId, user.id, 'milestone_renamed', { from: milestone.name, to: name.trim() })
    }
  })
  emitViewChange(milestone.projectId)
  return db.select().from(schema.milestones).where(eq(schema.milestones.id, milestone.id)).get()
})
