export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody(event)
  const { allowedEmailDomains } = body || {}

  if (allowedEmailDomains !== undefined) {
    if (!Array.isArray(allowedEmailDomains)) {
      throw createError({ statusCode: 400, message: 'allowedEmailDomains must be an array' })
    }

    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/
    const cleaned: string[] = []

    for (const domain of allowedEmailDomains) {
      if (typeof domain !== 'string') {
        throw createError({ statusCode: 400, message: 'Each domain must be a string' })
      }
      const trimmed = domain.trim().toLowerCase()
      if (trimmed === '') continue
      if (!domainRegex.test(trimmed)) {
        throw createError({ statusCode: 400, message: `Invalid domain: "${trimmed}"` })
      }
      cleaned.push(trimmed)
    }

    const unique = [...new Set(cleaned)]
    setSetting(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, unique)
  }

  return {
    allowedEmailDomains: getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, [])
  }
})
