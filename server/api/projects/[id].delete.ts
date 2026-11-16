import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event, { auth: 'owner' })

  // Collected before the delete: the cascade removes the attachment rows, and with
  // them the only record of which files on disk were this project's. A card delete
  // already did this; a project delete left every one of its files behind.
  const attachmentKeys = db.select({ storageKey: schema.attachments.storageKey })
    .from(schema.attachments)
    .where(eq(schema.attachments.projectId, project.id))
    .all()
    .map(a => a.storageKey)

  db.delete(schema.projects).where(eq(schema.projects.id, project.id)).run()

  // Best effort, as for a card: the project is gone either way.
  if (attachmentKeys.length > 0) {
    storage.deleteMany(attachmentKeys).catch((err) => {
      console.error('Failed to clean up attachment files:', err)
    })
  }

  return { ok: true }
})
