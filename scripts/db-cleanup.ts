#!/usr/bin/env npx tsx
/**
 * Database cleanup CLI — run with: pnpm db:cleanup
 *
 * Performs:
 * 1. Orphan removal (cards, statuses, boards, members without a parent project)
 * 2. Full VACUUM to reclaim disk space
 *
 * Safe to run while the server is stopped. If the server is running,
 * VACUUM may not fully compact due to WAL readers — stop the server first
 * for maximum space reclamation.
 */
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { statSync, unlinkSync } from 'node:fs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(projectRoot, '.env') })

const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')

console.log(`Database: ${dbPath}`)

const sizeBefore = statSync(dbPath).size
console.log(`Size before: ${(sizeBefore / 1024).toFixed(1)} KB`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// Count orphans
interface CountRow { cnt: number }
const orphanCards = db.prepare(`SELECT COUNT(*) as cnt FROM cards WHERE project_id NOT IN (SELECT id FROM projects)`).get() as CountRow
const orphanStatuses = db.prepare(`SELECT COUNT(*) as cnt FROM statuses WHERE project_id NOT IN (SELECT id FROM projects)`).get() as CountRow
const orphanBoards = db.prepare(`SELECT COUNT(*) as cnt FROM boards WHERE project_id NOT IN (SELECT id FROM projects)`).get() as CountRow
const orphanBoardCols = db.prepare(`SELECT COUNT(*) as cnt FROM board_columns WHERE board_id NOT IN (SELECT id FROM boards)`).get() as CountRow
const orphanMembers = db.prepare(`SELECT COUNT(*) as cnt FROM project_members WHERE project_id NOT IN (SELECT id FROM projects)`).get() as CountRow

const expiredInvitations = db.prepare(`SELECT COUNT(*) as cnt FROM project_invitations WHERE expires_at < unixepoch() * 1000`).get() as CountRow
const expiredVerifTokens = db.prepare(`SELECT COUNT(*) as cnt FROM email_verification_tokens WHERE expires_at < unixepoch() * 1000`).get() as CountRow

const totalOrphans = orphanCards.cnt + orphanStatuses.cnt + orphanBoards.cnt + orphanBoardCols.cnt + orphanMembers.cnt

if (totalOrphans > 0) {
  console.log(`\nOrphans found:`)
  if (orphanCards.cnt) console.log(`  cards: ${orphanCards.cnt}`)
  if (orphanStatuses.cnt) console.log(`  statuses: ${orphanStatuses.cnt}`)
  if (orphanBoards.cnt) console.log(`  boards: ${orphanBoards.cnt}`)
  if (orphanBoardCols.cnt) console.log(`  board_columns: ${orphanBoardCols.cnt}`)
  if (orphanMembers.cnt) console.log(`  project_members: ${orphanMembers.cnt}`)

  db.exec(`
    DELETE FROM cards WHERE project_id NOT IN (SELECT id FROM projects);
    DELETE FROM board_columns WHERE board_id NOT IN (SELECT id FROM boards);
    DELETE FROM statuses WHERE project_id NOT IN (SELECT id FROM projects);
    DELETE FROM boards WHERE project_id NOT IN (SELECT id FROM projects);
    DELETE FROM project_members WHERE project_id NOT IN (SELECT id FROM projects);
  `)
  console.log(`Removed ${totalOrphans} orphan rows`)
} else {
  console.log(`\nNo orphans found`)
}

// Expired tokens and invitations
const totalExpired = (expiredInvitations?.cnt || 0) + (expiredVerifTokens?.cnt || 0)
if (totalExpired > 0) {
  console.log(`\nExpired records found:`)
  if (expiredInvitations.cnt) console.log(`  project_invitations: ${expiredInvitations.cnt}`)
  if (expiredVerifTokens.cnt) console.log(`  email_verification_tokens: ${expiredVerifTokens.cnt}`)

  db.exec(`
    DELETE FROM project_invitations WHERE expires_at < unixepoch() * 1000;
    DELETE FROM email_verification_tokens WHERE expires_at < unixepoch() * 1000;
  `)
  console.log(`Removed ${totalExpired} expired records`)
} else {
  console.log(`\nNo expired records found`)
}

// Orphan attachment files
const uploadDir = resolve(projectRoot, process.env.UPLOAD_DIR || 'data/uploads')
try {
  const { readdirSync } = await import('node:fs')
  const files = readdirSync(uploadDir)
  const knownKeys = new Set(
    (db.prepare('SELECT storage_key FROM attachments').all() as Array<{ storage_key: string }>).map(r => r.storage_key)
  )
  let orphanFiles = 0
  for (const file of files) {
    if (!knownKeys.has(file)) {
      unlinkSync(resolve(uploadDir, file))
      orphanFiles++
    }
  }
  if (orphanFiles > 0) {
    console.log(`\nRemoved ${orphanFiles} orphan attachment files`)
  } else {
    console.log(`\nNo orphan attachment files found`)
  }
} catch (e: unknown) {
  if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
    console.log(`\nNo uploads directory found (${uploadDir}), skipping attachment cleanup`)
  } else {
    throw e
  }
}

// VACUUM
console.log(`\nRunning VACUUM...`)
db.exec('VACUUM')
db.close()

const sizeAfter = statSync(dbPath).size
console.log(`Size after: ${(sizeAfter / 1024).toFixed(1)} KB`)
const saved = sizeBefore - sizeAfter
if (saved > 0) {
  console.log(`Reclaimed: ${(saved / 1024).toFixed(1)} KB`)
} else {
  console.log(`No space to reclaim`)
}

console.log(`Done`)
