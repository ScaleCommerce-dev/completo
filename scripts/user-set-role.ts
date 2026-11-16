#!/usr/bin/env node
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

// Lowercased as login, registration and the API store it.
const email = process.argv[2]?.trim().toLowerCase()
const role = process.argv[3]

if (!email || !role || !['admin', 'user'].includes(role)) {
  console.error('Usage: pnpm user:set-role <email> <admin|user>')
  process.exit(1)
}

const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')
console.log(`Database: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

const user = db.prepare('SELECT id, name, email, is_admin, kind FROM users WHERE lower(email) = ?').get(email) as { id: string, name: string, email: string, is_admin: number, kind: string } | undefined

if (!user) {
  console.error(`No user found with email: ${email}`)
  db.close()
  process.exit(1)
}

// A bare UPDATE bypasses what PATCH /api/admin/users/:id enforces, so the two cases
// it cannot reproduce here are refused: an agent is never an admin, and an admin who
// manages agents loses admin only through the app, which removes those agents from
// projects their manager is not in (server/utils/agents.ts) and records it.
if (user.kind === 'agent') {
  console.error(`${user.name} is an agent; agents are never admins`)
  db.close()
  process.exit(1)
}

const isAdmin = role === 'admin' ? 1 : 0

if (user.is_admin === isAdmin) {
  console.log(`${user.name} (${user.email}) is already ${role}`)
  db.close()
  process.exit(0)
}

if (!isAdmin) {
  const agents = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE kind = 'agent' AND managed_by_id = ?`).get(user.id) as { n: number }
  if (agents.n > 0) {
    console.error(`${user.name} manages ${agents.n} agent${agents.n === 1 ? '' : 's'}. Demote them under Admin › Users in the app, which also takes the agents out of projects ${user.name} is not in.`)
    db.close()
    process.exit(1)
  }
}

db.prepare('UPDATE users SET is_admin = ? WHERE id = ?').run(isAdmin, user.id)
db.close()

console.log(`${user.name} (${user.email}) is now ${role}`)
