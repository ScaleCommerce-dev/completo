import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../database/schema'

const dbPath = process.env.DATABASE_URL || 'sqlite.db'
const sqlite = new Database(dbPath, { fileMustExist: false })
sqlite.pragma('journal_mode = WAL')
sqlite.pragma('foreign_keys = ON')
sqlite.pragma('auto_vacuum = INCREMENTAL')

export const db = drizzle(sqlite, { schema })
export { schema }
