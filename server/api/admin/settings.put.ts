import { adminSettingsSchema } from '#shared/schemas/admin'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const { allowedEmailDomains } = await readBodyAs(event, adminSettingsSchema)

  // The schema refuses a body without it ("Nothing to update").
  setSetting(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, allowedEmailDomains!)

  return {
    allowedEmailDomains: getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, [])
  }
})
