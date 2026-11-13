export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody(event)
  const { allowedEmailDomains, issueTemplate, interfaceMode } = body || {}

  // Checked before anything is saved, so a rejected request changes nothing.
  if (issueTemplate !== undefined) {
    if (typeof issueTemplate !== 'string') {
      throw createError({ statusCode: 400, message: 'issueTemplate must be a string' })
    }
    if (issueTemplate.length > ISSUE_TEMPLATE_MAX_LENGTH) {
      throw createError({ statusCode: 400, message: `issueTemplate must be at most ${ISSUE_TEMPLATE_MAX_LENGTH} characters` })
    }
  }
  if (interfaceMode !== undefined && !INTERFACE_MODES.some(m => m === interfaceMode)) {
    throw createError({ statusCode: 400, message: `interfaceMode must be one of ${INTERFACE_MODES.join(', ')}` })
  }

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

  // After the domains, so a rejected domain list saves nothing.
  if (issueTemplate !== undefined) setSetting(SETTINGS_KEYS.ISSUE_TEMPLATE, issueTemplate)
  if (interfaceMode !== undefined) setSetting(SETTINGS_KEYS.INTERFACE_MODE, interfaceMode)

  return {
    allowedEmailDomains: getSetting<string[]>(SETTINGS_KEYS.ALLOWED_EMAIL_DOMAINS, []),
    ...workspaceSettings()
  }
})
