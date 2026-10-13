/**
 * Dynamic client registration (RFC 7591), open to anyone: a registration grants
 * nothing by itself, since every token still needs a user to consent on the
 * authorize page. Rate-limited in `middleware/rate-limit.ts`.
 */
export default defineEventHandler(async (event) => {
  allowCrossOrigin(event)
  try {
    const body = (await readBody<Record<string, unknown>>(event)) ?? {}
    if (typeof body !== 'object') throw new OAuthError('invalid_client_metadata', 'Body must be a JSON object')
    const { client, secret } = registerClient({
      name: body.client_name,
      redirectUris: body.redirect_uris,
      authMethod: body.token_endpoint_auth_method
    })
    setResponseStatus(event, 201)
    return {
      client_id: client.id,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.authMethod,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {})
    }
  } catch (err) {
    return sendOAuthError(event, err)
  }
})
