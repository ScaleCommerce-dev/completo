#!/usr/bin/env npx tsx
/**
 * Seed demo data CLI — run with: pnpm db:seed
 *
 * Creates demo user, admin user, sample project with board/statuses/tags/cards,
 * and default AI skills. Skips anything that already exists.
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

async function hashPassword(password: string): Promise<string> {
  const cost = 16384
  const blockSize = 8
  const parallelization = 1
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, 64, {
    cost,
    blockSize,
    parallelization,
    maxmem: 32 * 1024 * 1024
  }) as Buffer
  return `$scrypt$n=${cost},r=${blockSize},p=${parallelization}$${salt.toString('base64').replace(/=+$/, '')}$${hash.toString('base64').replace(/=+$/, '')}`
}

const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')
console.log(`Database: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// --- Demo user + project ---
const existingDemo = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com') as { id: string } | undefined
if (existingDemo) {
  console.log('Demo user already exists — skipping')
} else {
  const userId = randomUUID()
  const now = Math.floor(Date.now() / 1000)

  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, email_verified_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, 'demo@example.com', 'Demo User', await hashPassword('demo1234'), now, now)
  console.log('Created demo user: demo@example.com / demo1234')

  // Create project
  const projectId = randomUUID()
  db.prepare(`
    INSERT INTO projects (id, name, slug, key, description, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, 'My Project', 'my-project', 'TK', 'A sample project to get started', now)

  // Add user as project owner
  db.prepare(`
    INSERT INTO project_members (id, project_id, user_id, role)
    VALUES (?, ?, ?, ?)
  `).run(randomUUID(), projectId, userId, 'owner')

  // Create board
  const boardId = randomUUID()
  db.prepare(`
    INSERT INTO boards (id, project_id, name, slug, position, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(boardId, projectId, 'Sprint Board', 'sprint-board', 0, now)

  // Create statuses at project level
  const statusNames = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']
  const statusColors = ['#a1a1aa', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981']
  const statusIds: string[] = []

  for (let i = 0; i < statusNames.length; i++) {
    const statusId = randomUUID()
    statusIds.push(statusId)
    db.prepare(`
      INSERT INTO statuses (id, project_id, name, color)
      VALUES (?, ?, ?, ?)
    `).run(statusId, projectId, statusNames[i], statusColors[i])

    // Link status to board via board_columns
    db.prepare(`
      INSERT INTO board_columns (id, board_id, status_id, position)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), boardId, statusId, i)
  }

  // Create default tags
  const defaultTags = [
    { name: 'Bug', color: '#ef4444' },
    { name: 'Feature', color: '#3b82f6' },
    { name: 'Discuss', color: '#f59e0b' }
  ]
  for (const tag of defaultTags) {
    db.prepare(`
      INSERT INTO tags (id, project_id, name, color)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), projectId, tag.name, tag.color)
  }

  // Set the Done status as the project's done status
  db.prepare(`
    UPDATE projects SET done_status_id = ?, done_retention_days = ? WHERE id = ?
  `).run(statusIds[4], 30, projectId)

  // Create sample cards
  const tomorrow = new Date(Date.now() + 86400000)
  const yesterday = new Date(Date.now() - 86400000)
  const nextWeek = new Date(Date.now() + 7 * 86400000)
  const toTimestamp = (d: Date | null) => d ? Math.floor(d.getTime() / 1000) : null

  const sampleCards = [
    { title: 'Set up CI/CD pipeline', description: 'Configure GitHub Actions for automated testing and deployment', statusIndex: 0, priority: 'medium', position: 0, dueDate: nextWeek },
    { title: 'Design database schema', description: 'Create the ERD and define all tables for the project', statusIndex: 1, priority: 'high', position: 0, dueDate: tomorrow },
    { title: 'Implement user authentication', description: 'Add login/register with session management', statusIndex: 2, priority: 'urgent', position: 0, dueDate: yesterday },
    { title: 'Write API documentation', description: 'Document all REST endpoints with examples', statusIndex: 3, priority: 'low', position: 0, dueDate: null }
  ]

  for (const card of sampleCards) {
    db.prepare(`
      INSERT INTO cards (status_id, project_id, title, description, assignee_id, priority, position, due_date, created_by_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(statusIds[card.statusIndex], projectId, card.title, card.description, userId, card.priority, card.position, toTimestamp(card.dueDate), userId, now, now)
  }

  console.log('Seed complete: 1 project, 1 board, 5 statuses, 3 tags, 4 cards')
}

// --- Admin user ---
const existingAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@example.com') as { id: string } | undefined
if (existingAdmin) {
  console.log('Admin user already exists — skipping')
} else {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO users (id, email, name, password_hash, is_admin, email_verified_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(randomUUID(), 'admin@example.com', 'Admin User', await hashPassword('admin1234'), 1, now, now)
  console.log('Created admin user: admin@example.com / admin1234')
}

// --- Default AI skills ---
const skillCount = db.prepare('SELECT COUNT(*) as count FROM ai_skills').get() as { count: number }
if (skillCount.count > 0) {
  console.log('AI skills already exist — skipping')
} else {
  const now = Math.floor(Date.now() / 1000)
  db.prepare(`
    INSERT INTO ai_skills (id, name, prompt, scope, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    'Generate Description',
    'Generate a description for this card:\n\nTitle: {title}\nPriority: {priority}\nTags: {tags}',
    'card', 0, now, now
  )

  db.prepare(`
    INSERT INTO ai_skills (id, name, prompt, scope, position, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    randomUUID(),
    'Improve Description',
    'Improve this card description. Make it clearer, better structured, and more actionable:\n\nTitle: {title}\nPriority: {priority}\nTags: {tags}\n\nCurrent description:\n{description}',
    'card', 1, now, now
  )

  console.log('Seeded 2 default AI skills')
}

db.close()
console.log('Done')
