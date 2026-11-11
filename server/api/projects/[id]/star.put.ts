/**
 * Star a project, putting it in the caller's sidebar. Idempotent.
 *
 * Members only. `resolveProject` lets an admin through to any project, so the
 * real membership is checked separately: an admin can open a project they are
 * not in, but the sidebar is for the projects you work in. 403 rather than 404
 * there, because the admin can already see the project exists.
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)

  if (!isProjectMember(project.id, user.id)) {
    throw createError({ statusCode: 403, message: 'Only members can star a project' })
  }

  db.insert(schema.projectStars)
    .values({ userId: user.id, projectId: project.id })
    .onConflictDoNothing()
    .run()

  return { starred: true }
})
