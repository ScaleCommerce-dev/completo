import { eq } from 'drizzle-orm'

/** Deleting a milestone keeps its cards; they lose the milestone (FK set null), which their history records. */
export default defineEventHandler(async (event) => {
  const { user, milestone } = await resolveMilestone(event)
  db.transaction(() => {
    recordMilestoneRemoval(user, milestone.id)
    db.delete(schema.milestones).where(eq(schema.milestones.id, milestone.id)).run()
    recordProjectActivity(milestone.projectId, user.id, 'milestone_removed', { name: milestone.name })
  })
  emitViewChange(milestone.projectId)
  return { ok: true }
})
