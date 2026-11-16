/**
 * Stands in for a provider callback (Google, GitHub, Microsoft), which a test cannot
 * drive: everything after the provider vouches for an address is `handleOAuthUser`.
 */
export default defineEventHandler(async (event) => {
  if (!process.env.ALLOW_TEST_ENDPOINTS) {
    throw createError({ statusCode: 404, message: 'Not found' })
  }

  const { email, name } = await readBody<{ email: string, name?: string }>(event)
  return handleOAuthUser(event, { email, name: name ?? 'OAuth User', avatarUrl: null, provider: 'test' })
})
