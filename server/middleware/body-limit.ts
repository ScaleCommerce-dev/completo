/**
 * Refuses a request body larger than the route could ever need, before anything
 * reads it.
 *
 * `readBody` buffers the whole body first, and nothing limited it, so anonymous
 * `POST /oauth/register` stored registrations of tens of megabytes each, at ten
 * per five minutes per address. The anonymous routes get a tight limit and must
 * declare their length (a chunked body has none, and would be buffered blind);
 * every other route gets a generous one. Uploads are exempt: they check their own
 * limit (`cards/[id]/attachments.post.ts`).
 */
const ANONYMOUS_MAX_BYTES = 16 * 1024
const DEFAULT_MAX_BYTES = 1024 * 1024
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

function isAnonymousRoute(path: string): boolean {
  return path.startsWith('/oauth/') || path.startsWith('/auth/')
}

function isUpload(path: string): boolean {
  return /^\/api\/cards\/[^/]+\/attachments$/.test(path)
}

export default defineEventHandler((event) => {
  if (!BODY_METHODS.has(event.method)) return
  const path = event.path.split('?')[0]!
  if (isUpload(path)) return

  const lengthHeader = getRequestHeader(event, 'content-length')
  const declared = lengthHeader === undefined ? undefined : Number(lengthHeader)
  const anonymous = isAnonymousRoute(path)
  const limit = anonymous ? ANONYMOUS_MAX_BYTES : DEFAULT_MAX_BYTES

  if (declared === undefined) {
    if (anonymous && getRequestHeader(event, 'transfer-encoding')) {
      throw createError({ statusCode: 411, message: 'Content-Length is required' })
    }
    return
  }
  if (!Number.isFinite(declared) || declared > limit) {
    throw createError({ statusCode: 413, message: 'Request body too large' })
  }
})
