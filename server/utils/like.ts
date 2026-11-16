import { sql, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/**
 * `column` contains `q`, with `q` matched literally.
 *
 * `%` and `_` are LIKE wildcards, and SQLite's LIKE has no escape character
 * unless ESCAPE names one, so drizzle's `like()` cannot express a literal: a
 * search for "50%" escaped for a clause with no ESCAPE matched nothing at all.
 * `\` is the escape here, so it is escaped too. LIKE is already case-insensitive
 * for ASCII, so nothing lowercases either side.
 */
export function likeContains(column: SQLiteColumn | SQL, q: string): SQL {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  return sql`${column} LIKE ${pattern} ESCAPE '\\'`
}
