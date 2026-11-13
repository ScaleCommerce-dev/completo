/**
 * The workspace settings every signed-in user needs: which interface the
 * workspace uses and the issue template new issues start with. Admins change
 * them through `/api/admin/settings`.
 */
export default defineEventHandler(async (event) => {
  await resolveAuth(event)
  return workspaceSettings()
})
