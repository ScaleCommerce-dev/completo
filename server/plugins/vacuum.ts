import Database from 'better-sqlite3'

export default defineNitroPlugin(() => {
  const dbPath = process.env.DATABASE_URL || 'sqlite.db'
  const sqlite = new Database(dbPath, { fileMustExist: false })
  const freed = sqlite.pragma('incremental_vacuum') as unknown[]
  sqlite.close()

  if (freed?.length) {
    console.log('[vacuum] Incremental vacuum completed on startup')
  }
})
