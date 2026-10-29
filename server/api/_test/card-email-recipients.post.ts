// Test-only: run the exit guard of card emails directly, so a test can prove a
// non-member or an opted-out user is dropped even when a caller hands them in.
// Through the public API every caller already filters to members first, which
// would let the guard be deleted without any test noticing.
export default defineEventHandler(async (event) => {
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  const { projectId, userIds } = await readBody<{ projectId: string, userIds: string[] }>(event)
  return Object.fromEntries(resolveCardEmailRecipients(projectId, userIds))
})
