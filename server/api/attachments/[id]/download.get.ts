import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')!

  const attachment = db.select().from(schema.attachments)
    .where(eq(schema.attachments.id, id))
    .get()

  if (!attachment) {
    throw createError({ statusCode: 404, message: 'Attachment not found' })
  }

  try {
    requireProjectMember(attachment.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Attachment not found' })
  }

  const data = await storage.read(attachment.storageKey)
  if (!data) {
    throw createError({ statusCode: 404, message: 'File not found on storage' })
  }

  // Derived from the filename, never from the stored `mimeType` — that value is whatever the
  // uploading client claimed, and serving it back inline made every attachment a stored-XSS
  // vector on this origin. `nosniff` stops the browser second-guessing the narrowed type.
  const contentType = serveContentType(attachment.originalName)
  const disposition = isInlineSafe(contentType) ? 'inline' : 'attachment'

  setResponseHeader(event, 'Content-Type', contentType)
  setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
  setResponseHeader(event, 'Content-Length', Number(attachment.size))
  setResponseHeader(event, 'Content-Disposition', `${disposition}; filename="${encodeURIComponent(attachment.originalName)}"`)
  setResponseHeader(event, 'Cache-Control', 'private, max-age=3600')

  return data
})
