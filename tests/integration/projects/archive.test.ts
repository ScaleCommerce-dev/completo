import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestTag, createTestCard, setCardTags } from '../../setup/fixtures'
import { addMember, createTestAgent, setCanCreateAgents } from '../../setup/agents'

interface Detail {
  id: string
  slug: string
  archivedAt: string | null
  starred: boolean
  statuses: Array<{ id: string, name: string }>
  tags: Array<{ id: string }>
  boards: Array<{ id: string }>
  lists: Array<{ id: string }>
  totalCards: number
}
type Listed = { id: string, archivedAt: string | null, starred: boolean }

const archive = (user: TestUser, id: string) =>
  $fetch(`/api/projects/${id}/archive`, { method: 'PUT', headers: user.headers }) as Promise<{ archivedAt: string | null }>
const restore = (user: TestUser, id: string) =>
  $fetch(`/api/projects/${id}/archive`, { method: 'DELETE', headers: user.headers }) as Promise<{ archivedAt: string | null }>
const detail = (user: TestUser, id: string) =>
  $fetch(`/api/projects/${id}`, { headers: user.headers }) as Promise<Detail>
const listed = async (user: TestUser, id: string) =>
  ((await $fetch('/api/projects', { headers: user.headers })) as Listed[]).find(p => p.id === id)
const members = async (user: TestUser, id: string) =>
  ((await $fetch(`/api/projects/${id}/members`, { headers: user.headers })) as Array<{ id: string }>).map(m => m.id).sort()

/** Everything archiving must leave alone, read through the API rather than assumed. */
async function snapshot(user: TestUser, id: string) {
  const d = await detail(user, id)
  return {
    statuses: d.statuses.map(s => s.id).sort(),
    tags: d.tags.map(t => t.id).sort(),
    boards: d.boards.map(b => b.id).sort(),
    lists: d.lists.map(l => l.id).sort(),
    totalCards: d.totalCards,
    members: await members(user, id)
  }
}

describe('project archive', () => {
  let owner: TestUser
  let member: TestUser
  let outsider: TestUser
  let admin: TestUser
  let project: Detail
  let cardId: number
  let agentCardId: number
  const word = `zebrafish${Date.now()}`

  beforeAll(async () => {
    owner = await registerTestUser()
    member = await registerTestUser()
    outsider = await registerTestUser()
    admin = await createAdminUser()
    const created = await createTestProject(owner)
    await addMember(owner, created.id, member.id)
    project = await detail(owner, created.id)
    const todo = project.statuses.find(s => s.name === 'To Do')!.id
    const card = await createTestCard(owner, project.id, todo, { title: `Archived ${word}`, assigneeId: member.id, dueDate: '2026-11-25' })
    cardId = card.id
    const tag = await createTestTag(owner, project.id, { name: 'Keep' })
    await setCardTags(owner, cardId, [tag.id])
    await $fetch(`/api/projects/${project.id}/star`, { method: 'PUT', headers: member.headers })
    // A card held by the owner's agent, for "My agents' work" on My Tasks.
    await setCanCreateAgents(admin, owner, true)
    const agent = await createTestAgent(owner)
    await addMember(owner, project.id, agent.id)
    agentCardId = (await createTestCard(owner, project.id, todo, { title: 'Agent work', assigneeId: agent.id })).id
  })

  it('archives and restores without touching statuses, tags, views, cards or members', async () => {
    const before = await snapshot(owner, project.id)
    expect(before.totalCards).toBe(2)

    const archived = await archive(owner, project.id)
    expect(archived.archivedAt).toBeTruthy()
    expect(await snapshot(owner, project.id)).toEqual(before)

    const restored = await restore(owner, project.id)
    expect(restored.archivedAt).toBeNull()
    expect(await snapshot(owner, project.id)).toEqual(before)
  })

  it('keeps an archived project open and listed, with its timestamp, for everyone who could see it', async () => {
    await archive(owner, project.id)
    try {
      // Members still read it, its cards still answer.
      expect((await detail(member, project.slug)).archivedAt).toBeTruthy()
      await $fetch(`/api/cards/${cardId}`, { headers: member.headers })
      // Listed, so the CLI and MCP can resolve its slug; the client hides it.
      expect((await listed(member, project.id))?.archivedAt).toBeTruthy()
      // The star survives, so a restore puts it back in the same sidebars.
      expect((await listed(member, project.id))?.starred).toBe(true)
    } finally {
      await restore(owner, project.id)
    }
  })

  it('keeps the first timestamp when archived twice, and restoring twice is harmless', async () => {
    const first = await archive(owner, project.id)
    const second = await archive(owner, project.slug)
    expect(second.archivedAt).toBe(first.archivedAt)
    await restore(owner, project.id)
    expect((await restore(owner, project.id)).archivedAt).toBeNull()
  })

  it('is for owners and admins: 403 for a member, 404 for a non-member', async () => {
    await expectError(archive(member, project.id), 403)
    await expectError(restore(member, project.id), 403)
    await expectError(archive(outsider, project.id), 404)
    await expectError(restore(outsider, project.id), 404)
    expect((await detail(owner, project.id)).archivedAt).toBeNull()

    expect((await archive(admin, project.id)).archivedAt).toBeTruthy()
    expect((await restore(admin, project.id)).archivedAt).toBeNull()
  })

  describe('cross-project views leave an archived project out', () => {
    const inMyTasks = async () => {
      const data = await $fetch('/api/my-tasks', { headers: member.headers }) as { groups: Array<{ project: { id: string } }> }
      return data.groups.some(g => g.project.id === project.id)
    }
    const inAgentsWork = async () => {
      const data = await $fetch('/api/my-tasks/agents', { headers: owner.headers }) as { cards: Array<{ id: number }> }
      return data.cards.some(c => c.id === agentCardId)
    }
    const inCalendar = async () => {
      const data = await $fetch('/api/calendar', { headers: member.headers, query: { from: '2026-11-23', to: '2026-11-29' } }) as { cards: Array<{ id: number }>, projects: Array<{ id: string }>, archivedProjects: Array<{ id: string }> }
      return {
        card: data.cards.some(c => c.id === cardId),
        picker: data.projects.some(p => p.id === project.id),
        // Named apart, so a saved calendar filtering by it can say "archived" rather than "not a member".
        archived: data.archivedProjects.some(p => p.id === project.id)
      }
    }
    const search = async (projectId?: string) =>
      ((await $fetch('/api/cards/search', { headers: member.headers, params: { q: word, ...(projectId && { projectId }) } })) as Array<{ id: number }>).some(c => c.id === cardId)

    it('shows the card while the project is active', async () => {
      expect(await inMyTasks()).toBe(true)
      expect(await inAgentsWork()).toBe(true)
      expect(await inCalendar()).toEqual({ card: true, picker: true, archived: false })
      expect(await search()).toBe(true)
    })

    it('hides it from My Tasks, Calendar and global search while archived, and brings it back on restore', async () => {
      await archive(owner, project.id)
      try {
        expect(await inMyTasks()).toBe(false)
        expect(await inCalendar()).toEqual({ card: false, picker: false, archived: true })
        expect(await inAgentsWork()).toBe(false)
        expect(await search()).toBe(false)
        // A search scoped to the archived project, from inside it, still finds its cards.
        expect(await search(project.id)).toBe(true)
      } finally {
        await restore(owner, project.id)
      }
      expect(await inMyTasks()).toBe(true)
      expect(await inAgentsWork()).toBe(true)
      expect(await inCalendar()).toEqual({ card: true, picker: true, archived: false })
      expect(await search()).toBe(true)
    })
  })
})
