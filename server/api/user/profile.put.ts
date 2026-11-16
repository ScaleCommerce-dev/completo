import { eq } from 'drizzle-orm'
import { profileUpdateSchema } from '#shared/schemas/user'

export default defineEventHandler(async (event) => {
  const { user, authMethod } = await resolveAuth(event)
  if (user.kind === 'agent') {
    throw createError({ statusCode: 403, message: 'An agent is edited by its manager' })
  }
  const { name, avatarUrl, colorMode, emailNotifications } = await readBodyAs(event, profileUpdateSchema)

  db.update(schema.users).set({
    ...(name !== undefined && { name }),
    ...(avatarUrl !== undefined && { avatarUrl }),
    ...(colorMode !== undefined && { colorMode }),
    ...(emailNotifications !== undefined && { emailNotifications: emailNotifications ? 1 : 0 })
  }).where(eq(schema.users.id, user.id)).run()

  const updated = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()!

  if (authMethod === 'session') {
    await setAuthSession(event, updated)
  }

  return { id: updated.id, email: updated.email, name: updated.name, avatarUrl: updated.avatarUrl, colorMode: updated.colorMode, emailNotifications: !!updated.emailNotifications }
})
