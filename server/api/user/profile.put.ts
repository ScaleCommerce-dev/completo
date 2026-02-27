import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, authMethod } = await resolveAuth(event)
  const { name, avatarUrl, colorMode } = await readBody<{ name?: string, avatarUrl?: string | null, colorMode?: string | null }>(event)

  if (name !== undefined && !name.trim()) {
    throw createError({ statusCode: 400, message: 'Name cannot be empty' })
  }

  if (avatarUrl !== undefined && avatarUrl !== null) {
    if (typeof avatarUrl !== 'string' || avatarUrl.length > 2048) {
      throw createError({ statusCode: 400, message: 'Invalid avatar URL' })
    }
    if (avatarUrl && !/^https?:\/\//i.test(avatarUrl)) {
      throw createError({ statusCode: 400, message: 'Avatar URL must use http or https' })
    }
  }

  db.update(schema.users).set({
    ...(name !== undefined && { name: name.trim() }),
    ...(avatarUrl !== undefined && { avatarUrl }),
    ...(colorMode !== undefined && { colorMode })
  }).where(eq(schema.users.id, user.id)).run()

  const updated = db.select().from(schema.users).where(eq(schema.users.id, user.id)).get()!

  if (authMethod === 'session') {
    await setAuthSession(event, updated)
  }

  return { id: updated.id, email: updated.email, name: updated.name, avatarUrl: updated.avatarUrl, colorMode: updated.colorMode }
})
