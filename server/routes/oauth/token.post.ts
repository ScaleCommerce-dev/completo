export default defineEventHandler(async (event) => {
  allowCrossOrigin(event)
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'pragma', 'no-cache')
  try {
    const body = (await readBody<Record<string, unknown>>(event)) ?? {}
    if (typeof body !== 'object') throw new OAuthError('invalid_request', 'Body must be form-encoded or JSON')
    const client = await authenticateClient(event, body)
    switch (body.grant_type) {
      case 'authorization_code':
        return exchangeCode(event, client, body)
      case 'refresh_token':
        return refreshGrant(client, body)
      default:
        throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token')
    }
  } catch (err) {
    return sendOAuthError(event, err)
  }
})
