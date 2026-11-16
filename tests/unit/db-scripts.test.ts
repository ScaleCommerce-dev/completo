import { describe, it, expect, beforeEach } from 'vitest'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { eq } from 'drizzle-orm'
import * as schema from '../../server/database/schema'

/**
 * The boot scripts (docker/zpinit/entrypoint.d) run on every container start and
 * have no server around them, so nothing else exercises them. Rows are written
 * through drizzle, so the stored encoding is whatever the schema really produces,
 * not what a script assumes it is.
 */
const ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const MIGRATIONS = resolve(ROOT, 'server/database/migrations')

let dir: string
let dbPath: string
let db: BetterSQLite3Database<typeof schema>
let sqlite: Database.Database

function run(script: string, args: string[] = []): string {
  sqlite.close()
  try {
    return execFileSync('node', [resolve(ROOT, 'scripts', script), ...args], {
      env: { ...process.env, DATABASE_URL: dbPath, UPLOAD_DIR: resolve(dir, 'uploads') },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } finally {
    sqlite = new Database(dbPath)
    db = drizzle(sqlite, { schema })
  }
}

function addUser(isAdmin = 0) {
  const id = crypto.randomUUID()
  db.insert(schema.users).values({ id, email: `${id}@example.com`, name: 'U', passwordHash: 'x', isAdmin }).run()
  return id
}

function addProject(slug: string, key: string) {
  const id = crypto.randomUUID()
  db.insert(schema.projects).values({ id, name: slug, slug, key }).run()
  return id
}

beforeEach(() => {
  dir = mkdtempSync(resolve(tmpdir(), 'completo-scripts-'))
  dbPath = resolve(dir, 'test.db')
  sqlite = new Database(dbPath)
  db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: MIGRATIONS })
})

describe('db-cleanup', () => {
  it('removes expired invitations and email tokens, and keeps live ones', () => {
    const userId = addUser()
    const projectId = addProject('p', 'PP')
    const hour = 3600_000
    const live = new Date(Date.now() + 24 * hour)
    const dead = new Date(Date.now() - hour)

    db.insert(schema.emailVerificationTokens).values([
      { userId, token: 'live-reset', purpose: 'reset', expiresAt: live },
      { userId, token: 'dead-verify', purpose: 'verify', expiresAt: dead }
    ]).run()
    db.insert(schema.projectInvitations).values([
      { email: 'a@example.com', projectId, invitedById: userId, token: 'live-invite', expiresAt: new Date(Date.now() + 7 * 24 * hour) },
      { email: 'b@example.com', projectId, invitedById: userId, token: 'dead-invite', expiresAt: dead }
    ]).run()

    run('db-cleanup.ts')

    expect(db.select().from(schema.emailVerificationTokens).all().map(r => r.token)).toEqual(['live-reset'])
    expect(db.select().from(schema.projectInvitations).all().map(r => r.token)).toEqual(['live-invite'])
  })
})

describe('db-seed', () => {
  it('creates the demo once, and not again after it is deleted', () => {
    addUser(1)
    expect(run('db-seed.ts')).toContain('Seed complete')
    expect(db.select().from(schema.projects).all().map(p => p.slug)).toEqual(['my-project'])

    db.delete(schema.projects).where(eq(schema.projects.slug, 'my-project')).run()
    run('db-seed.ts')
    expect(db.select().from(schema.projects).all()).toEqual([])
  })

  it('does not abort boot when the demo was renamed', () => {
    addUser(1)
    run('db-seed.ts')
    db.update(schema.projects).set({ slug: 'renamed' }).where(eq(schema.projects.slug, 'my-project')).run()

    expect(() => run('db-seed.ts')).not.toThrow()
    expect(db.select().from(schema.projects).all().map(p => p.slug)).toEqual(['renamed'])
  })

  it('leaves an install that predates the marker alone, even if its project took key TK', () => {
    addUser(1)
    addProject('mine', 'TK')

    expect(() => run('db-seed.ts')).not.toThrow()
    expect(db.select().from(schema.projects).all().map(p => p.slug)).toEqual(['mine'])
  })

  it('waits for an admin, then seeds', () => {
    run('db-seed.ts')
    expect(db.select().from(schema.projects).all()).toEqual([])

    addUser(1)
    run('db-seed.ts')
    expect(db.select().from(schema.projects).all().map(p => p.slug)).toEqual(['my-project'])
  })
})

describe('user-create', () => {
  it('stores the address lowercased, as login looks it up', () => {
    run('user-create.ts', ['Admin@Example.com', 'secret-pass', 'Admin', 'admin'])
    expect(db.select({ email: schema.users.email }).from(schema.users).all()).toEqual([{ email: 'admin@example.com' }])
  })

  it('repairs an address an earlier version stored with capitals, instead of adding a second account', () => {
    const id = addUser(1)
    db.update(schema.users).set({ email: 'Admin@Example.com' }).where(eq(schema.users.id, id)).run()

    run('user-create.ts', ['admin@example.com', 'secret-pass', 'Admin', 'admin', '--skip-existing'])
    expect(db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).all()).toEqual([{ id, email: 'admin@example.com' }])
  })
})

describe('user-set-role', () => {
  const isAdmin = (id: string) => db.select({ isAdmin: schema.users.isAdmin }).from(schema.users).where(eq(schema.users.id, id)).get()!.isAdmin

  it('never makes an agent an admin', () => {
    const id = addUser()
    db.update(schema.users).set({ kind: 'agent' }).where(eq(schema.users.id, id)).run()
    expect(() => run('user-set-role.ts', [`${id}@example.com`, 'admin'])).toThrow()
    expect(isAdmin(id)).toBe(0)
  })

  it('leaves demoting an agent manager to the app, which prunes their agents', () => {
    const manager = addUser(1)
    const agent = addUser()
    db.update(schema.users).set({ kind: 'agent', managedById: manager }).where(eq(schema.users.id, agent)).run()
    expect(() => run('user-set-role.ts', [`${manager}@example.com`, 'user'])).toThrow()
    expect(isAdmin(manager)).toBe(1)

    const plain = addUser(1)
    run('user-set-role.ts', [`${plain.toUpperCase()}@EXAMPLE.COM`, 'user'])
    expect(isAdmin(plain)).toBe(0)
  })
})
