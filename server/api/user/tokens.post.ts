import { tokenCreateSchema } from '#shared/schemas/auth'

export default defineEventHandler(async (event) => {
  const { session } = await requireActiveSession(event)
  const { name, expiresInDays } = await readBodyAs(event, tokenCreateSchema)
  return mintApiToken(session.user.id, { name, expiresInDays })
})
