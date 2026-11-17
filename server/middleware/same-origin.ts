/**
 * Refuses a state-changing request that a browser sent from another site, and
 * keeps the app out of other sites' frames.
 *
 * The session cookie is `SameSite=Lax`, which stops a cross-*site* form from
 * carrying it but not a *same-site* one: any page on a sibling subdomain of the
 * install's parent domain counts as the same site, so it could POST to `/mcp` or
 * to the OAuth consent endpoint with the user's session. Nothing else checked
 * where a request came from.
 *
 * The check reads what browsers send and nothing else, so the CLI, MCP clients,
 * the test suite and any other non-browser caller (which send neither header)
 * are unaffected:
 * - `Sec-Fetch-Site` when present: `same-origin` and `none` (typed URL,
 *   bookmark) pass; `same-site` and `cross-site` are refused.
 * - otherwise `Origin`: its host must be this app's.
 * A bearer token is not ambient, so a request carrying one of ours is not
 * checked (`carriesAuthToken`: only the prefixes `resolveAuth` reads, since any
 * other `Bearer` header is ignored there and the cookie authenticates instead);
 * nor are the OAuth token, registration and revocation endpoints, which exist to
 * be called cross-origin and never read the session.
 *
 * The headers: `frame-ancestors 'none'` (and `X-Frame-Options` for older
 * browsers) stops clickjacking the consent page. There is no `script-src`: the
 * served page carries inline scripts (Nuxt's runtime config and the colour-mode
 * script), so a policy that allowed them would add nothing and one that did not
 * would stop the app booting. DOMPurify stays the XSS layer for rendered HTML.
 */
const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const CROSS_ORIGIN_BY_DESIGN = new Set(['/oauth/token', '/oauth/register', '/oauth/revoke'])

const CONTENT_SECURITY_POLICY = [
  'frame-ancestors \'none\'',
  'base-uri \'self\'',
  'object-src \'none\'',
  'form-action \'self\''
].join('; ')

/** The hosts this app answers as: the request's own, and the configured URL's. */
function ownHosts(event: Parameters<typeof getRequestHeader>[0]): Set<string> {
  const hosts = new Set<string>()
  for (const h of [getRequestHeader(event, 'host'), getRequestHeader(event, 'x-forwarded-host')]) {
    if (h) hosts.add(h.split(',')[0]!.trim().toLowerCase())
  }
  try {
    hosts.add(new URL(appBaseUrl()).host.toLowerCase())
  } catch {
    // An unparsable APP_URL leaves the request's own host as the only answer.
  }
  return hosts
}

/** Whether a browser says this request came from somewhere else. */
function isCrossSiteRequest(event: Parameters<typeof getRequestHeader>[0]): boolean {
  const fetchSite = getRequestHeader(event, 'sec-fetch-site')
  if (fetchSite) return fetchSite !== 'same-origin' && fetchSite !== 'none'
  const origin = getRequestHeader(event, 'origin')
  if (!origin) return false
  if (origin === 'null') return true
  try {
    return !ownHosts(event).has(new URL(origin).host.toLowerCase())
  } catch {
    return true
  }
}

export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-security-policy', CONTENT_SECURITY_POLICY)
  setResponseHeader(event, 'x-frame-options', 'DENY')

  if (!UNSAFE_METHODS.has(event.method)) return
  if (CROSS_ORIGIN_BY_DESIGN.has(event.path.split('?')[0]!)) return
  if (carriesAuthToken(getRequestHeader(event, 'authorization'))) return
  if (isCrossSiteRequest(event)) {
    throw createError({ statusCode: 403, message: 'Cross-site request refused' })
  }
})
