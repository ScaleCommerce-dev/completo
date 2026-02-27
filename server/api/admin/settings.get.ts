export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  return {
    allowedEmailDomains: getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, [])
  }
})
