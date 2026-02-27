#!/usr/bin/env npx tsx
/**
 * Set user role CLI — run with: pnpm user:set-role <email> <admin|user>
 *
 * Promotes or demotes an existing user to/from admin.
 */
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(projectRoot, '.env') })

const email = process.argv[2]
const role = process.argv[3]

if (!email || !role || !['admin', 'user'].includes(role)) {
  console.error('Usage: pnpm user:set-role <email> <admin|user>')
  process.exit(1)
}

const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')
console.log(`Database: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

const user = db.prepare('SELECT id, name, email, is_admin FROM users WHERE email = ?').get(email) as { id: string, name: string, email: string, is_admin: number } | undefined

if (!user) {
  console.error(`No user found with email: ${email}`)
  db.close()
  process.exit(1)
}

const isAdmin = role === 'admin' ? 1 : 0

if (user.is_admin === isAdmin) {
  console.log(`${user.name} (${user.email}) is already ${role}`)
  db.close()
  process.exit(0)
}

db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin, user.id)
db.close()

console.log(`${user.name} (${user.email}) is now ${role}`)
