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

  await storage.delete(attachment.storageKey)
  db.delete(schema.attachments).where(eq(schema.attachments.id, id)).run()

  return { ok: true }
})
