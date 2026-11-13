import { eq, max } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  const { name, description, targetDate } = await readBody<{ name?: string, description?: string | null, targetDate?: string | null }>(event) ?? {}
  if (typeof name !== 'string' || !name.trim()) throw createError({ statusCode: 400, message: 'Milestone name is required' })
  if (targetDate && (typeof targetDate !== 'string' || !isIsoDate(targetDate))) throw createError({ statusCode: 400, message: 'targetDate must be YYYY-MM-DD' })
  const last = db.select({ p: max(schema.milestones.position) }).from(schema.milestones)
    .where(eq(schema.milestones.projectId, project.id)).get()
  const row = db.transaction(() => {
    const r = db.insert(schema.milestones).values({
      projectId: project.id,
      name: name.trim(),
      description: description || null,
      targetDate: targetDate || null,
      position: (last?.p ?? -1) + 1
    }).returning().get()
    recordProjectActivity(project.id, user.id, 'milestone_added', { name: r.name })
    return r
  })
  emitViewChange(project.id)
  setResponseStatus(event, 201)
  return row
})
