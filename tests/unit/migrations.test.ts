import { describe, it, expect } from 'vitest'
import { resolve, join } from 'node:path'
import { mkdtempSync, cpSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

/**
 * 0019 adds unique indexes to tables whose add paths were check-then-insert, so an
 * install may already hold duplicates, and a unique index over them would fail the
 * migration and with it the boot. It removes them first; this runs it on such data.
 */
describe('migration 0019 on a database with duplicates', () => {
  it('keeps one of each, the owner row for a membership, and builds the indexes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'completo-mig-'))
    cpSync(MIGRATIONS, dir, { recursive: true })
    const journalPath = join(dir, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const upTo = journal.entries.findIndex(e => e.tag.startsWith('0019_'))
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, upTo) }))

    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    migrate(drizzle(db), { migrationsFolder: dir })

    db.exec(`
      INSERT INTO users (id, email, name, password_hash, created_at) VALUES ('u', 'u@x', 'U', 'x', 0);
      INSERT INTO projects (id, name, slug, key, created_at) VALUES ('p', 'P', 'p', 'PP', 0);
      INSERT INTO statuses (id, project_id, name) VALUES ('s', 'p', 'S');
      INSERT INTO boards (id, project_id, name, created_at) VALUES ('b', 'p', 'B', 0);
      INSERT INTO tags (id, project_id, name) VALUES ('t', 'p', 'T');
      INSERT INTO cards (id, status_id, project_id, title, position, created_at, updated_at) VALUES (1, 's', 'p', 'C', 0, 0, 0);
      INSERT INTO project_members (id, project_id, user_id, role) VALUES ('m1', 'p', 'u', 'member'), ('m2', 'p', 'u', 'owner');
      INSERT INTO card_tags (id, card_id, tag_id) VALUES ('ct1', 1, 't'), ('ct2', 1, 't');
      INSERT INTO board_columns (id, board_id, status_id, position) VALUES ('bc1', 'b', 's', 0), ('bc2', 'b', 's', 1);
    `)

    migrate(drizzle(db), { migrationsFolder: MIGRATIONS })

    expect(db.prepare('SELECT id, role FROM project_members').all()).toEqual([{ id: 'm2', role: 'owner' }])
    expect(db.prepare('SELECT id FROM card_tags').all()).toEqual([{ id: 'ct1' }])
    expect(db.prepare('SELECT id FROM board_columns').all()).toEqual([{ id: 'bc1' }])
    expect(() => db.exec(`INSERT INTO card_tags (id, card_id, tag_id) VALUES ('ct3', 1, 't')`)).toThrow(/UNIQUE/)
  })
})
