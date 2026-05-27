#!/usr/bin/env npx tsx
/**
 * Create user CLI — run with:
 *   pnpm user:create <email> <password> [name] [admin] [--skip-existing]
 *   pnpm user:create --from-env [--skip-existing]
 *
 * Creates a new user with email + password, auto-verified so they can
 * log in immediately. Append `admin` (trailing positional) to create an
 * admin user. `--from-env` reads ADMIN_USER_EMAIL / ADMIN_USER_PASSWORD /
 * ADMIN_USER_NAME from the environment (dotenv-loaded), implies admin,
 * and exits 0 quietly when those env vars are absent.
 */
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID, randomBytes, scrypt as scryptCb } from 'node:crypto'
import { promisify } from 'node:util'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(projectRoot, '.env') })

const scryptAsync = promisify(scryptCb)

const args = process.argv.slice(2)
const skipExisting = args.includes('--skip-existing')
const fromEnv = args.includes('--from-env')
// Strip flags; the trailing `admin` token (if present) marks admin role.
// Strict positional check — a password literally equal to "admin" no longer
// silently elevates the user (previous parser used `args.includes('admin')`).
const positional = args.filter(a => !a.startsWith('--'))

let email: string | undefined
let password: string | undefined
let name: string | undefined
let isAdmin = false

if (fromEnv) {
  email = process.env.ADMIN_USER_EMAIL
  password = process.env.ADMIN_USER_PASSWORD
  name = process.env.ADMIN_USER_NAME || (email ? email.split('@')[0] : undefined)
  isAdmin = true
  if (!email || !password) {
    console.log('[user:create --from-env] ADMIN_USER_EMAIL / ADMIN_USER_PASSWORD not set — skipping admin creation')
    process.exit(0)
  }
} else {
  // `admin` is a marker only when it's the LAST positional and there are
  // at least 3 positionals (email + password + something). This way a
  // password or name accidentally equal to "admin" doesn't escalate.
  if (positional.length >= 3 && positional[positional.length - 1] === 'admin') {
    isAdmin = true
    positional.pop()
  }
  email = positional[0]
  password = positional[1]
  name = positional[2]
}

if (!email || !password) {
  console.error('Usage: pnpm user:create <email> <password> [name] [admin] [--skip-existing]')
  console.error('   or: pnpm user:create --from-env [--skip-existing]')
  process.exit(1)
}

const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')
console.log(`Database: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// Check for existing user
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as { id: string } | undefined
if (existing) {
  if (skipExisting) {
    console.log(`User already exists with email: ${email} — skipping`)
    db.close()
    process.exit(0)
  }
  console.error(`User already exists with email: ${email}`)
  db.close()
  process.exit(1)
}

// Hash password — produces PHC scrypt string compatible with nuxt-auth-utils
// Format: $scrypt$n=16384,r=8,p=1$<salt-b64>$<hash-b64>
const cost = 16384
const blockSize = 8
const parallelization = 1
const saltSize = 16
const keyLength = 64

const salt = randomBytes(saltSize)
const hash = await scryptAsync(password, salt, keyLength, {
  cost,
  blockSize,
  parallelization,
  maxmem: 32 * 1024 * 1024
}) as Buffer

const passwordHash = `$scrypt$n=${cost},r=${blockSize},p=${parallelization}$${salt.toString('base64').replace(/=+$/, '')}$${hash.toString('base64').replace(/=+$/, '')}`

const now = Math.floor(Date.now() / 1000)
const userId = randomUUID()
const displayName = name || email.split('@')[0]

db.prepare(`
  INSERT INTO users (id, email, name, password_hash, is_admin, email_verified_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`).run(userId, email, displayName, passwordHash, isAdmin ? 1 : 0, now, now)

db.close()

console.log(`Created ${isAdmin ? 'admin' : 'user'}: ${displayName} (${email})`)
console.log(`Email auto-verified — user can log in immediately`)
