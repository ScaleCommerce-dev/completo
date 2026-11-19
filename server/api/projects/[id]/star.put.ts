/**
 * Star a project, putting it in the caller's sidebar. Idempotent.
 *
 * Anyone who can see the project may star it: its members, and an admin, who sees
 * every project. Admins were refused here (403) on the reasoning that the sidebar
 * is for the projects you work in, but an admin who looks after a project without
 * being in it then had no way to keep it at hand. `resolveProject` already answers
 * 404 to everyone else. The star is re-checked on every read, so it stops counting
 * when the caller leaves the project or loses admin (see `projectStars`).
 */
export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)

  db.insert(schema.projectStars)
    .values({ userId: user.id, projectId: project.id })
    .onConflictDoNothing()
    .run()

  return { starred: true }
})
