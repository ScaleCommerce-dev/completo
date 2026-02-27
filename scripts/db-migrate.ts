#!/usr/bin/env npx tsx
/**
 * Database migration CLI — run with: pnpm db:migrate
 *
 * Applies pending SQL migrations from server/database/migrations/ to the
 * database. Migrations are generated with `npx drizzle-kit generate` and
 * tracked in the migrations journal so each runs exactly once.
 *
 * Unlike `drizzle-kit push` (which diffs schema → DB directly), this
 * command applies versioned migration files — safer for production.
 */
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(projectRoot, '.env') })
const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')
const migrationsFolder = resolve(projectRoot, 'server/database/migrations')

console.log(`Database: ${dbPath}`)
console.log(`Migrations: ${migrationsFolder}`)

const sqlite = new Database(dbPath, { fileMustExist: false })
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')

const db = drizzle(sqlite)

try {
  migrate(db, { migrationsFolder })
  console.log('Migrations applied successfully')
} catch (error: unknown) {
  console.error(`Migration failed: ${(error as Error).message}`)
  sqlite.close()
  process.exit(1)
}

sqlite.close()
