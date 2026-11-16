/**
 * Stands in for a provider callback (Google, GitHub, Microsoft), which a test cannot
 * drive: everything after the provider vouches for an address is `handleOAuthUser`.
 */
export default defineEventHandler(async (event) => {
  requireTestEndpoints()

  const { email, name } = await readBody<{ email: string, name?: string }>(event)
  return handleOAuthUser(event, { email, name: name ?? 'OAuth User', avatarUrl: null, provider: 'test' })
})
