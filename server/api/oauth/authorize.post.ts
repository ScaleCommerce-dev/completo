/**
 * The decision. Allow mints a code bound to the user, client, redirect URI and
 * PKCE challenge; deny carries `access_denied` back. Either way the answer is a
 * URL the page navigates to, because the redirect must happen in the browser.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  const body = (await readBody<Record<string, unknown>>(event)) ?? {}
  let req: AuthorizeRequest
  try {
    req = await parseAuthorizeRequest(event, body)
  } catch (err) {
    if (!(err instanceof OAuthError)) throw err
    if (!err.redirectable) throw createError({ statusCode: 400, message: err.message })
    // The client and URI checked out, so the client is told, in its own flow.
    const redirectUri = typeof body.redirect_uri === 'string' ? body.redirect_uri : ''
    const state = typeof body.state === 'string' ? body.state : null
    return { redirectTo: redirectWith(redirectUri, { error: err.error, error_description: err.message, state }) }
  }
  if (body.decision !== 'allow') {
    return { redirectTo: redirectWith(req.redirectUri, { error: 'access_denied', state: req.state }) }
  }
  const code = issueCode(session.user.id, req)
  return { redirectTo: redirectWith(req.redirectUri, { code, state: req.state }) }
})
