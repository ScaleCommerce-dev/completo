import { eq } from 'drizzle-orm'

/**
 * Get a global setting by key. Returns the parsed JSON value, or the default if not set.
 */
export function getSetting<T>(key: string, defaultValue: T): T {
  const row = db.select()
    .from(schema.globalSettings)
    .where(eq(schema.globalSettings.key, key))
    .get()

  if (!row) return defaultValue

  try {
    return JSON.parse(row.value) as T
  } catch {
    return defaultValue
  }
}

/**
 * Set a global setting. Upserts (inserts or replaces).
 */
export function setSetting(key: string, value: unknown): void {
  const serialized = JSON.stringify(value)
  const now = new Date()

  const existing = db.select()
    .from(schema.globalSettings)
    .where(eq(schema.globalSettings.key, key))
    .get()

  if (existing) {
    db.update(schema.globalSettings)
      .set({ value: serialized, updatedAt: now })
      .where(eq(schema.globalSettings.key, key))
      .run()
  } else {
    db.insert(schema.globalSettings)
      .values({ key, value: serialized, updatedAt: now })
      .run()
  }
}

/** Well-known setting keys */
export const SETTINGS_KEYS = {
  ALLOWED_EMAIL_DOMAINS: 'allowedEmailDomains'
} as const
