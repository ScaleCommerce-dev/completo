/**
 * What the consent page shows: the request, checked, and who is asking. The
 * page is the app's own, so this is session-only; a bearer token cannot grant
 * consent on a user's behalf.
 */
export default defineEventHandler(async (event) => {
  const { session } = await requireActiveSession(event)
  try {
    const req = await parseAuthorizeRequest(event, getQuery(event))
    // The name is whatever the client registered or wrote in its metadata document,
    // so anyone can call themselves "Claude". What cannot be chosen freely is where
    // the code goes (the redirect host) and, for a metadata-document client, the host
    // that served the document. The page leads with those.
    return {
      clientName: req.client.name,
      redirectHost: new URL(req.redirectUri).host,
      clientHost: req.client.id.startsWith('https://') ? new URL(req.client.id).host : null,
      user: { name: session.user.name, email: session.user.email }
    }
  } catch (err) {
    if (err instanceof OAuthError) throw createError({ statusCode: 400, message: err.message })
    throw err
  }
})
