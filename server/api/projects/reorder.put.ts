import { asc, eq } from 'drizzle-orm'

/**
 * The manual order of projects (`projects.position`). One workspace, one order,
 * so only instance admins set it. The listed projects take the first positions
 * in the order given; any project not listed (one created while the list was
 * being dragged) keeps its relative place after them.
 */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { projectIds } = await readBody<{ projectIds?: unknown }>(event) ?? {}

  if (!Array.isArray(projectIds) || projectIds.length === 0 || !projectIds.every(id => typeof id === 'string')) {
    throw createError({ statusCode: 400, message: 'projectIds must be a non-empty array of project ids' })
  }
  if (new Set(projectIds).size !== projectIds.length) {
    throw createError({ statusCode: 400, message: 'projectIds must not repeat a project' })
  }

  const all = db.select({ id: schema.projects.id }).from(schema.projects)
    .orderBy(asc(schema.projects.position), asc(schema.projects.createdAt)).all().map(p => p.id)
  const known = new Set(all)
  const unknown = (projectIds as string[]).filter(id => !known.has(id))
  if (unknown.length) {
    throw createError({ statusCode: 400, message: `Unknown project: ${unknown.join(', ')}` })
  }

  const listed = new Set(projectIds as string[])
  const order = [...(projectIds as string[]), ...all.filter(id => !listed.has(id))]
  db.transaction((tx) => {
    order.forEach((id, position) => {
      tx.update(schema.projects).set({ position }).where(eq(schema.projects.id, id)).run()
    })
  })

  return { ok: true }
})
