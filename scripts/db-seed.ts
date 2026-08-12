#!/usr/bin/env node
/**
 * Seed demo data CLI — run with: pnpm db:seed
 *
 * Creates a sample project with board/statuses/tags/cards and the
 * default AI skills. The demo project is attributed to whichever admin
 * user already exists (env-provisioned in the Docker boot flow, or
 * created via `pnpm user:create`); if no admin exists, the demo
 * project is skipped (we don't want default credentials in production).
 * Idempotent — skips anything that already exists.
 */
import { config } from 'dotenv'
import Database from 'better-sqlite3'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
config({ path: resolve(projectRoot, '.env') })

const dbPath = resolve(projectRoot, process.env.DATABASE_URL || 'sqlite.db')
console.log(`Database: ${dbPath}`)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// --- Demo project + cards ---
// User creation lives in scripts/user-create.ts — the seed only handles
// demo content. The demo project + sample cards need an owner, so we
// look up an existing admin (env-provisioned in the Docker boot flow,
// or via `pnpm user:create` in dev). If no admin exists, skip the
// demo project entirely — we don't want any user with default
// credentials sitting in production DBs.
const existingProject = db.prepare('SELECT id FROM projects WHERE slug = ?').get('my-project') as { id: string } | undefined
if (existingProject) {
  console.log('Demo project already exists — skipping')
} else {
  const adminRow = db.prepare('SELECT id FROM users WHERE is_admin = 1 ORDER BY created_at LIMIT 1').get() as { id: string } | undefined
  if (!adminRow) {
    console.log('No admin user exists — skipping demo project (create an admin first: `pnpm user:create <email> <password> "Name" admin`, then re-run seed)')
  } else {
    const ownerId = adminRow.id
    const now = Math.floor(Date.now() / 1000)
    const projectId = randomUUID()

    db.prepare(`
      INSERT INTO projects (id, name, slug, key, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(projectId, 'My Project', 'my-project', 'TK', 'A sample project to get started', now)

    db.prepare(`
      INSERT INTO project_members (id, project_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(randomUUID(), projectId, ownerId, 'owner')

    // Board
    const boardId = randomUUID()
    db.prepare(`
      INSERT INTO boards (id, project_id, name, slug, position, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(boardId, projectId, 'Sprint Board', 'sprint-board', 0, now)

    // Statuses
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

      db.prepare(`
        INSERT INTO board_columns (id, board_id, status_id, position)
        VALUES (?, ?, ?, ?)
      `).run(randomUUID(), boardId, statusId, i)
    }

    // Tags
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

    db.prepare(`
      UPDATE projects SET done_status_id = ?, done_retention_days = ? WHERE id = ?
    `).run(statusIds[4], 30, projectId)

    // Sample cards — assigned to the admin owner.
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
      `).run(statusIds[card.statusIndex], projectId, card.title, card.description, ownerId, card.priority, card.position, toTimestamp(card.dueDate), ownerId, now, now)
    }

    console.log('Seed complete: 1 project, 1 board, 5 statuses, 3 tags, 4 cards')
  }
}

// --- Default AI skills are NOT seeded ---
// They live in server/database/migrations/0003_default_ai_skills.sql.
//
// This script runs on *every* boot (dev container boot and the prod entrypoint both
// call it), so an idempotent insert here would resurrect a default skill that an
// admin deliberately deleted, on the next restart. A migration hands the rows over
// once and then leaves them alone. Keep this file to demo content only, as its header
// says — anything a real installation depends on belongs in a migration.

db.close()
console.log('Done')
