import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch } from '../setup/server'
import { registerTestUser, type TestUser } from '../setup/auth'
import { createTestProject, createTestBoard, createTestCard, createTestTag, getBoard } from '../setup/fixtures'

/**
 * My Tasks is a list view, so its cells must be able to edit what a project's
 * own list view can. They could not: the payload carried `statuses` but neither
 * `tags` nor `members`, so the tag and assignee cells fell back to read-only and
 * the page rendered the same table with fewer controls.
 *
 * This pins the payload rather than the rendering — the cells are shared
 * components and are exercised by the list view's own tests.
 */
describe('GET /api/my-tasks — editable field data', async () => {
  let user: TestUser
  beforeAll(async () => {
    user = await registerTestUser()
  })

  async function groupFor(name: string, opts?: { tag?: string }) {
    const project = await createTestProject(user, { name })
    if (opts?.tag) await createTestTag(user, project.id, { name: opts.tag })
    const board = await createTestBoard(user, project.id)
    const statusId = (await getBoard(user, board.id)).columns[0]!.id
    await createTestCard(user, project.id, statusId, { title: 'Mine', assigneeId: user.id })

    const data = await $fetch('/api/my-tasks', { headers: user.headers }) as {
      groups: Array<{
        project: { id: string }
        statuses: unknown[]
        tags: Array<{ id: string, name: string }>
        members: Array<{ id: string, name: string }>
        cards: unknown[]
      }>
    }
    return data.groups.find(g => g.project.id === project.id)!
  }

  it('carries the members a card can be reassigned to', async () => {
    const group = await groupFor(`MyTasks Members ${Date.now()}`)

    expect(group).toBeDefined()
    expect(Array.isArray(group.members)).toBe(true)
    expect(group.members.map(m => m.id)).toContain(user.id)
  })

  it('carries the project tags a card can be tagged with', async () => {
    // With no tag created this asserted only that an empty array is an array,
    // which stayed green for the whole time the payload carried no tags at all —
    // the defect this file exists to catch. The members test above was already
    // doing it properly.
    const name = `Taggable ${Date.now()}`
    const group = await groupFor(`MyTasks Tags ${Date.now()}`, { tag: name })

    expect(group.tags.map(t => t.name)).toContain(name)
  })

  it('still carries the statuses a card can be moved to', async () => {
    const group = await groupFor(`MyTasks Statuses ${Date.now()}`)

    expect(group.statuses.length).toBeGreaterThan(0)
  })

  it('does not leak member email addresses', async () => {
    // Same rule as project member search: name only.
    const group = await groupFor(`MyTasks NoEmail ${Date.now()}`)

    for (const m of group.members) {
      expect(m).not.toHaveProperty('email')
    }
  })
})
