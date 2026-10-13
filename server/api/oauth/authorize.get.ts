/**
 * What the consent page shows: the request, checked, and who is asking. The
 * page is the app's own, so this is session-only; a bearer token cannot grant
 * consent on a user's behalf.
 */
export default defineEventHandler(async (event) => {
  const session = await requireUserSession(event)
  try {
    const req = await parseAuthorizeRequest(event, getQuery(event))
    return {
      clientName: req.client.name,
      redirectHost: new URL(req.redirectUri).host,
      user: { name: session.user.name, email: session.user.email }
    }
  } catch (err) {
    if (err instanceof OAuthError) throw createError({ statusCode: 400, message: err.message })
    throw err
  }
})
