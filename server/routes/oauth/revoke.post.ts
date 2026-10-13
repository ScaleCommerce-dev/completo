export default defineEventHandler(async (event) => {
  allowCrossOrigin(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  try {
    const body = (await readBody<Record<string, unknown>>(event)) ?? {}
    if (typeof body !== 'object') throw new OAuthError('invalid_request', 'Body must be form-encoded or JSON')
    const client = await authenticateClient(event, body)
    if (typeof body.token === 'string' && body.token) revokeToken(client, body.token)
    return {}
  } catch (err) {
    return sendOAuthError(event, err)
  }
})
