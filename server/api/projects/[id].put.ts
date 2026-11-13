import { eq, and, ne } from 'drizzle-orm'

interface ProjectUpdateBody {
  name?: string
  description?: string
  briefing?: string | null
  key?: string
  slug?: string
  icon?: string
  doneStatusId?: string | null
  doneRetentionDays?: number | null
  /** A member who leads the project; null clears it. */
  leadId?: string | null
  state?: ProjectState
  /** YYYY-MM-DD, the first day of the period the resolution names. */
  startDate?: string | null
  startDateResolution?: DateResolution | null
  targetDate?: string | null
  targetDateResolution?: DateResolution | null
  priority?: 'low' | 'medium' | 'high' | 'urgent' | null
}

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event, { auth: 'owner' })
  const { name, description, briefing, key, slug, icon, doneStatusId, doneRetentionDays, leadId, state, startDate, startDateResolution, targetDate, targetDateResolution, priority } = await readBody<ProjectUpdateBody>(event)

  if (leadId !== undefined && leadId !== null) {
    const isMember = typeof leadId === 'string' && db.select().from(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, project.id), eq(schema.projectMembers.userId, leadId))).get()
    if (!isMember) throw createError({ statusCode: 400, message: 'Lead is not a project member' })
    // A lead is a person, as an owner is: agents never hold a project role.
    const lead = db.select({ kind: schema.users.kind }).from(schema.users).where(eq(schema.users.id, leadId)).get()
    if (lead?.kind === 'agent') throw createError({ statusCode: 400, message: 'An agent cannot lead a project' })
  }
  if (priority !== undefined && priority !== null && !['low', 'medium', 'high', 'urgent'].includes(priority)) {
    throw createError({ statusCode: 400, message: 'priority must be low, medium, high, urgent or null' })
  }
  if (state !== undefined && !PROJECT_STATES.includes(state)) {
    throw createError({ statusCode: 400, message: `state must be one of ${PROJECT_STATES.join(', ')}` })
  }
  for (const [d, r] of [[startDate, startDateResolution], [targetDate, targetDateResolution]] as const) {
    if (d !== undefined && d !== null && (typeof d !== 'string' || !isIsoDate(d))) throw createError({ statusCode: 400, message: 'Dates must be YYYY-MM-DD' })
    if (r !== undefined && r !== null && !DATE_RESOLUTIONS.includes(r)) throw createError({ statusCode: 400, message: `resolution must be one of ${DATE_RESOLUTIONS.join(', ')}` })
  }

  if (key !== undefined) {
    if (!/^[A-Z]{2,5}$/.test(key)) {
      throw createError({ statusCode: 400, message: 'Project key must be 2-5 uppercase letters' })
    }
    const existing = db.select().from(schema.projects)
      .where(and(eq(schema.projects.key, key), ne(schema.projects.id, project.id)))
      .get()
    if (existing) {
      throw createError({ statusCode: 409, message: `Project key "${key}" is already in use` })
    }
  }

  if (slug !== undefined) {
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      throw createError({ statusCode: 400, message: 'Slug must be lowercase alphanumeric with hyphens' })
    }
    const existing = db.select().from(schema.projects)
      .where(and(eq(schema.projects.slug, slug), ne(schema.projects.id, project.id)))
      .get()
    if (existing) {
      throw createError({ statusCode: 409, message: `Slug "${slug}" is already in use` })
    }
  }

  if (doneStatusId !== undefined && doneStatusId !== null) {
    const col = db.select().from(schema.statuses)
      .where(and(eq(schema.statuses.id, doneStatusId), eq(schema.statuses.projectId, project.id)))
      .get()
    if (!col) {
      throw createError({ statusCode: 400, message: 'Done status must belong to this project' })
    }
  }

  if (doneRetentionDays !== undefined && doneRetentionDays !== null) {
    if (typeof doneRetentionDays !== 'number' || !Number.isInteger(doneRetentionDays) || doneRetentionDays < 1) {
      throw createError({ statusCode: 400, message: 'doneRetentionDays must be a positive integer or null' })
    }
  }

  db.transaction(() => {
    db.update(schema.projects).set({
      ...(name !== undefined && { name }),
      ...(slug !== undefined && { slug }),
      ...(description !== undefined && { description }),
      ...(briefing !== undefined && { briefing: briefing || null }),
      ...(key !== undefined && { key }),
      ...(icon !== undefined && { icon: icon || null }),
      ...(doneStatusId !== undefined && { doneStatusId }),
      ...(doneRetentionDays !== undefined && { doneRetentionDays }),
      ...(leadId !== undefined && { leadId }),
      ...(state !== undefined && { state }),
      ...(startDate !== undefined && { startDate, startDateResolution: startDate ? (startDateResolution ?? 'day') : null }),
      ...(targetDate !== undefined && { targetDate, targetDateResolution: targetDate ? (targetDateResolution ?? 'day') : null }),
      ...(priority !== undefined && { priority })
    }).where(eq(schema.projects.id, project.id)).run()
    // The done status is completed by definition, and the former one, if it was
    // completed, goes back to unstarted: the done status and the categories then
    // agree on what counts as done, as they do for a new project.
    if (doneStatusId && doneStatusId !== project.doneStatusId) {
      db.update(schema.statuses).set({ category: 'completed' }).where(eq(schema.statuses.id, doneStatusId)).run()
      if (project.doneStatusId) {
        db.update(schema.statuses).set({ category: 'unstarted' })
          .where(and(eq(schema.statuses.id, project.doneStatusId), eq(schema.statuses.category, 'completed'))).run()
      }
    }
    recordProjectChanges(project, db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get()!, user.id)
  })

  return db.select().from(schema.projects).where(eq(schema.projects.id, project.id)).get()
})
