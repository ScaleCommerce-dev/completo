import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core'
import * as schema from '../../server/database/schema'

const MIGRATIONS = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../server/database/migrations')

/**
 * The integration suite builds its database with `drizzle-kit push`, straight
 * from schema.ts, so it cannot see a migration that disagrees with the schema;
 * every real install runs the migrations instead. This applies them to an empty
 * database and compares what they built against what schema.ts declares.
 *
 * Foreign-key actions are what it checks, because that is where the two drifted:
 * for `ALTER TABLE ... ADD` drizzle-kit writes `REFERENCES users(id)` and drops
 * the declared `ON DELETE set null` (0014 had to be corrected by hand). SQLite
 * then defaults to NO ACTION, which with `foreign_keys = ON` makes deleting the
 * referenced row fail, so the bug shows up only as "cannot delete this user" on
 * an upgraded install.
 */
describe('migrations', () => {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONS })

  const tables = Object.values(schema).filter((t): t is SQLiteTable => t instanceof SQLiteTable)

  it('find every table in the schema', () => {
    expect(tables.length).toBeGreaterThan(10)
  })

  for (const table of tables) {
    const config = getTableConfig(table)
    if (!config.foreignKeys.length) continue

    it(`build ${config.name} with the foreign-key actions schema.ts declares`, () => {
      const declared = config.foreignKeys.map((fk) => {
        const ref = fk.reference()
        return {
          from: ref.columns[0]!.name,
          table: getTableConfig(ref.foreignTable).name,
          onDelete: (fk.onDelete ?? 'no action').toUpperCase()
        }
      }).sort((a, b) => a.from.localeCompare(b.from))

      const built = (sqlite.prepare(`PRAGMA foreign_key_list(${config.name})`).all() as Array<{ from: string, table: string, on_delete: string }>)
        .map(r => ({ from: r.from, table: r.table, onDelete: r.on_delete.toUpperCase() }))
        .sort((a, b) => a.from.localeCompare(b.from))

      expect(built).toEqual(declared)
    })
  }
})
