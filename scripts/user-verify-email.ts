#!/usr/bin/env npx tsx
/**
 * Manual email verification CLI — run with: pnpm user:verify-email <email>
 *
 * Marks a user's email as verified directly in the database.
 * Useful when SMTP is not configured or for admin troubleshooting.
 */
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(projectRoot, '.env') })

const email = process.argv[2]

if (!email) {
  console.error('Usage: pnpm user:verify-email <email>')
  process.exit(1)
}

const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')
console.log(`Database: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

const user = db.prepare('SELECT id, name, email, email_verified_at FROM users WHERE email = ?').get(email) as any

if (!user) {
  console.error(`No user found with email: ${email}`)
  db.close()
  process.exit(1)
}

console.log(`Found user: ${user.name} (${user.email})`)

if (user.email_verified_at) {
  const verifiedDate = new Date(user.email_verified_at * 1000).toISOString()
  console.log(`Already verified at: ${verifiedDate}`)
  db.close()
  process.exit(0)
}

const now = Math.floor(Date.now() / 1000)
db.prepare('UPDATE users SET email_verified_at = ? WHERE id = ?').run(now, user.id)
db.prepare('DELETE FROM email_verification_tokens WHERE user_id = ?').run(user.id)
db.close()

console.log(`Email verified successfully`)
