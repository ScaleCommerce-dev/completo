import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, createTestToken, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'
import {
  createTestAgent, createAgentToken, setCanCreateAgents, addMember, uniqueAgentName,
  type TestAgent, type TestAgentDetail
} from '../../setup/agents'

/**
 * Agents as their manager and admins handle them: who may create one, who may
 * see and edit it, its tokens, suspension, deletion, and that a token makes the
 * agent its own principal on REST and on /mcp.
 */
describe('Agents: creating and managing', () => {
  let admin: TestUser
  let permitted: TestUser
  let plain: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    permitted = await registerTestUser()
    plain = await registerTestUser()
    await setCanCreateAgents(admin, permitted, true)
  })

  describe('POST /api/agents', () => {
    it('lets an admin create an agent, and makes them its manager', async () => {
      const agent = await createTestAgent(admin, { description: 'Implements backlog cards', color: '#F97316' })
      expect(agent.kind).toBe('agent')
      expect(agent.managedBy).toEqual({ id: admin.id, name: admin.name, avatarUrl: null })
      expect(agent.description).toBe('Implements backlog cards')
      expect(agent.color).toBe('#f97316')
      expect(agent.suspended).toBe(false)
      expect(agent.tokens).toEqual([])
    })

    it('lets a person with canCreateAgents create one, managed by them', async () => {
      const agent = await createTestAgent(permitted)
      expect(agent.managedBy?.id).toBe(permitted.id)
    })

    it('refuses a person without the permission', async () => {
      await expectError($fetch('/api/agents', { method: 'POST', body: { name: uniqueAgentName() }, headers: plain.headers }), 403)
    })

    it('refuses an agent creating an agent, even one managed by an admin', async () => {
      const agent = await createTestAgent(admin)
      const { headers } = await createAgentToken(admin, agent.id)
      await expectError($fetch('/api/agents', { method: 'POST', body: { name: uniqueAgentName() }, headers }), 403)
    })

    it('gives the agent a synthetic address on the reserved agents.invalid domain', async () => {
      const agent = await createTestAgent(admin, { name: uniqueAgentName('Release Bot') })
      expect(agent.email).toMatch(/^release-bot-[a-z0-9-]+-[0-9a-f]{4}@agents\.invalid$/)
    })

    it('refuses a name another agent has, whatever its case', async () => {
      const name = uniqueAgentName('Claude')
      await createTestAgent(admin, { name })
      await expectError($fetch('/api/agents', { method: 'POST', body: { name: name.toUpperCase() }, headers: permitted.headers }), 409)
    })

    it('lets an agent share a name with a person: only agents must be unique', async () => {
      const agent = await createTestAgent(admin, { name: plain.name })
      expect(agent.name).toBe(plain.name)
    })

    it('refuses a missing name and a colour that is not a hex value', async () => {
      await expectError($fetch('/api/agents', { method: 'POST', body: { name: '  ' }, headers: admin.headers }), 400)
      await expectError($fetch('/api/agents', { method: 'POST', body: { name: uniqueAgentName(), color: 'orange' }, headers: admin.headers }), 400)
    })
  })

  describe('GET /api/agents', () => {
    it('lists the agents the caller manages, with projects and token counts', async () => {
      const manager = await registerTestUser()
      await setCanCreateAgents(admin, manager, true)
      const project = await createTestProject(manager)
      const agent = await createTestAgent(manager)
      await addMember(manager, project.id, agent.id)
      await createAgentToken(manager, agent.id)

      const list = await $fetch('/api/agents', { headers: manager.headers }) as TestAgent[]
      expect(list).toHaveLength(1)
      expect(list[0]).toMatchObject({
        id: agent.id,
        managedBy: { id: manager.id, name: manager.name },
        projectCount: 1,
        projects: [expect.objectContaining({ id: project.id, role: 'member' })],
        tokenCount: 1,
        suspended: false
      })
      expect(list[0]).not.toHaveProperty('email')
    })

    it('gives a person who manages no agents an empty list', async () => {
      expect(await $fetch('/api/agents', { headers: plain.headers })).toEqual([])
    })

    it('lets only admins list every agent', async () => {
      await expectError($fetch('/api/agents', { query: { scope: 'all' }, headers: permitted.headers }), 403)
      await expectError($fetch('/api/agents', { query: { managerId: admin.id }, headers: permitted.headers }), 403)
      const mine = await createTestAgent(permitted)
      const all = await $fetch('/api/agents', { query: { scope: 'all' }, headers: admin.headers }) as TestAgent[]
      expect(all.map(a => a.id)).toContain(mine.id)
    })

    it('filters by manager, status and a search over name and description', async () => {
      const manager = await registerTestUser()
      await setCanCreateAgents(admin, manager, true)
      const active = await createTestAgent(manager, { description: 'Triages new bug reports' })
      const sleeping = await createTestAgent(manager)
      await $fetch(`/api/agents/${sleeping.id}/suspend`, { method: 'POST', headers: manager.headers })

      const byManager = await $fetch('/api/agents', { query: { scope: 'all', managerId: manager.id }, headers: admin.headers }) as TestAgent[]
      expect(byManager.map(a => a.id).sort()).toEqual([active.id, sleeping.id].sort())

      const suspended = await $fetch('/api/agents', { query: { status: 'suspended' }, headers: manager.headers }) as TestAgent[]
      expect(suspended.map(a => a.id)).toEqual([sleeping.id])

      const searched = await $fetch('/api/agents', { query: { q: 'bug reports' }, headers: manager.headers }) as TestAgent[]
      expect(searched.map(a => a.id)).toEqual([active.id])
    })

    it('searches for % and _ literally', async () => {
      const manager = await registerTestUser()
      await setCanCreateAgents(admin, manager, true)
      const percent = await createTestAgent(manager, { description: 'Keeps coverage at 50% or more' })
      await createTestAgent(manager, { description: 'Plain description' })

      const hits = await $fetch('/api/agents', { query: { q: '50%' }, headers: manager.headers }) as TestAgent[]
      expect(hits.map(a => a.id)).toEqual([percent.id])
      const wildcard = await $fetch('/api/agents', { query: { q: '_' }, headers: manager.headers }) as TestAgent[]
      expect(wildcard).toEqual([])
    })
  })

  describe('GET, PATCH and DELETE /api/agents/:id', () => {
    let agent: TestAgentDetail

    beforeAll(async () => {
      agent = await createTestAgent(permitted)
    })

    it('shows the agent to its manager and to admins, and to nobody else', async () => {
      expect((await $fetch(`/api/agents/${agent.id}`, { headers: permitted.headers }) as TestAgentDetail).id).toBe(agent.id)
      expect((await $fetch(`/api/agents/${agent.id}`, { headers: admin.headers }) as TestAgentDetail).id).toBe(agent.id)
      await expectError($fetch(`/api/agents/${agent.id}`, { headers: plain.headers }), 404)
    })

    it('does not treat a person as an agent', async () => {
      await expectError($fetch(`/api/agents/${plain.id}`, { headers: admin.headers }), 404)
    })

    it('edits name, description and colour, for its manager', async () => {
      const name = uniqueAgentName('Renamed')
      const updated = await $fetch(`/api/agents/${agent.id}`, {
        method: 'PATCH',
        body: { name, description: 'Drafts the changelog', color: '#22c55e' },
        headers: permitted.headers
      }) as TestAgentDetail
      expect(updated).toMatchObject({ name, description: 'Drafts the changelog', color: '#22c55e' })
    })

    it('refuses an edit by someone who does not manage it', async () => {
      await expectError($fetch(`/api/agents/${agent.id}`, { method: 'PATCH', body: { description: 'x' }, headers: plain.headers }), 404)
    })

    it('refuses a rename to another agent\'s name', async () => {
      const other = await createTestAgent(permitted)
      await expectError($fetch(`/api/agents/${agent.id}`, { method: 'PATCH', body: { name: other.name.toLowerCase() }, headers: permitted.headers }), 409)
    })

    it('deletes an agent: its cards become unassigned and its token stops working', async () => {
      const doomed = await createTestAgent(permitted)
      const project = await createTestProject(permitted)
      await addMember(permitted, project.id, doomed.id)
      const board = await createTestBoard(permitted, project.id)
      const statusId = (await getBoard(permitted, board.id)).columns[0]!.id
      const card = await createTestCard(permitted, project.id, statusId, { assigneeId: doomed.id })
      const { headers } = await createAgentToken(permitted, doomed.id)

      await expectError($fetch(`/api/agents/${doomed.id}`, { method: 'DELETE', headers: plain.headers }), 404)
      await $fetch(`/api/agents/${doomed.id}`, { method: 'DELETE', headers: permitted.headers })

      const after = await $fetch(`/api/cards/${card.id}`, { headers: permitted.headers }) as { assigneeId: string | null }
      expect(after.assigneeId).toBeNull()
      expect((await fetch(url('/api/user/profile'), { headers })).status).toBe(401)
    })
  })

  describe('agent tokens', () => {
    let agent: TestAgentDetail

    beforeAll(async () => {
      agent = await createTestAgent(permitted)
    })

    it('returns the raw token once and lists it afterwards by prefix only', async () => {
      const created = await createAgentToken(permitted, agent.id, 'MacBook, Claude Code')
      expect(created.token).toMatch(/^dzo_/)

      const detail = await $fetch(`/api/agents/${agent.id}`, { headers: permitted.headers }) as TestAgentDetail
      const listed = detail.tokens.find(t => t.id === created.id)!
      expect(listed).toMatchObject({ name: 'MacBook, Claude Code', tokenPrefix: created.tokenPrefix })
      expect(JSON.stringify(detail)).not.toContain(created.token)
      expect(listed).not.toHaveProperty('tokenHash')
    })

    it('lets an admin mint a token for someone else\'s agent, and nobody else', async () => {
      await createAgentToken(admin, agent.id)
      await expectError($fetch(`/api/agents/${agent.id}/tokens`, { method: 'POST', body: { name: 'x' }, headers: plain.headers }), 404)
    })

    it('deletes a token, which then stops working', async () => {
      const { id, headers } = await createAgentToken(permitted, agent.id)
      expect((await fetch(url('/api/projects'), { headers })).status).toBe(200)
      await $fetch(`/api/agents/${agent.id}/tokens/${id}`, { method: 'DELETE', headers: permitted.headers })
      expect((await fetch(url('/api/projects'), { headers })).status).toBe(401)
    })

    it('caps an agent at 25 tokens', async () => {
      const capped = await createTestAgent(permitted)
      for (let i = 0; i < 25; i++) await createAgentToken(permitted, capped.id, `t${i}`)
      await expectError($fetch(`/api/agents/${capped.id}/tokens`, { method: 'POST', body: { name: 'one too many' }, headers: permitted.headers }), 400)
    })

    it('never lets an agent mint a token for itself: /api/user/tokens stays session-only', async () => {
      const { headers } = await createAgentToken(permitted, agent.id)
      const res = await fetch(url('/api/user/tokens'), {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'self-issued' })
      })
      expect(res.status).toBe(401)
    })
  })

  describe('an agent token is the agent', () => {
    let manager: TestUser
    let agent: TestAgentDetail
    let agentHeaders: Record<string, string>
    let project: { id: string, slug: string, key: string }
    let statusId: string

    beforeAll(async () => {
      manager = await registerTestUser()
      await setCanCreateAgents(admin, manager, true)
      project = await createTestProject(manager)
      agent = await createTestAgent(manager, { color: '#8b5cf6' })
      await addMember(manager, project.id, agent.id)
      agentHeaders = (await createAgentToken(manager, agent.id)).headers
      const board = await createTestBoard(manager, project.id)
      statusId = (await getBoard(manager, board.id)).columns[0]!.id
    })

    it('creates cards and comments as itself on REST', async () => {
      const card = await createTestCard({ ...manager, headers: agentHeaders }, project.id, statusId, { title: 'Written by the agent' })
      expect(card.createdById).toBe(agent.id)

      const detail = await $fetch(`/api/cards/${card.id}`, { headers: manager.headers }) as { creator: Record<string, unknown> }
      expect(detail.creator).toEqual({
        id: agent.id,
        name: agent.name,
        avatarUrl: null,
        kind: 'agent',
        color: '#8b5cf6',
        managedBy: { id: manager.id, name: manager.name, avatarUrl: null }
      })

      const comment = await $fetch(`/api/cards/${card.id}/comments`, {
        method: 'POST',
        body: { body: 'Done, patch attached.' },
        headers: agentHeaders
      }) as Record<string, unknown>
      expect(comment).toMatchObject({ authorId: agent.id, authorName: agent.name, authorKind: 'agent', authorManagedBy: { id: manager.id } })

      const comments = await $fetch(`/api/cards/${card.id}/comments`, { headers: manager.headers }) as Array<Record<string, unknown>>
      expect(comments[0]).toMatchObject({ authorId: agent.id, authorKind: 'agent', authorColor: '#8b5cf6', authorManagedBy: { id: manager.id, name: manager.name } })
    })

    it('records the agent as the uploader of an attachment', async () => {
      const card = await createTestCard(manager, project.id, statusId)
      const form = new FormData()
      form.append('file', new Blob(['patch'], { type: 'text/plain' }), 'fix.patch.txt')
      const res = await fetch(url(`/api/cards/${card.id}/attachments`), { method: 'POST', body: form, headers: agentHeaders })
      expect(res.status).toBe(201)
      const list = await $fetch(`/api/cards/${card.id}/attachments`, { headers: manager.headers }) as Array<{ uploader: { id: string, kind: string } }>
      expect(list[0]!.uploader).toMatchObject({ id: agent.id, kind: 'agent' })
    })

    it('acts as itself through /mcp, so "me" is the agent', async () => {
      const res = await fetch(url('/mcp'), {
        method: 'POST',
        headers: { ...agentHeaders, 'content-type': 'application/json', 'accept': 'application/json, text/event-stream' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: { name: 'create_card', arguments: { project: project.slug, title: 'Via MCP', assignee: 'me' } }
        })
      })
      expect(res.status).toBe(200)
      const body = await res.json() as { result: { isError: boolean, content: Array<{ text: string }> } }
      expect(body.result.isError).toBe(false)
      const ticket = JSON.parse(body.result.content[0]!.text).ticket as string

      const card = await $fetch(`/api/cards/${ticket}`, { headers: manager.headers }) as { createdById: string, assignee: { id: string, kind: string } }
      expect(card.createdById).toBe(agent.id)
      expect(card.assignee).toMatchObject({ id: agent.id, kind: 'agent' })
    })

    it('sees only the projects it was added to', async () => {
      await createTestProject(manager)
      const projects = await $fetch('/api/projects', { headers: agentHeaders }) as Array<{ id: string }>
      expect(projects.map(p => p.id)).toEqual([project.id])
    })

    it('stamps the agent\'s own last-seen time', async () => {
      const detail = await $fetch(`/api/agents/${agent.id}`, { headers: manager.headers }) as TestAgentDetail
      expect(detail.lastSeenAt).not.toBeNull()
    })
  })

  describe('suspending', () => {
    it('revokes every token, so the old token stops working, and refuses new ones until unsuspended', async () => {
      const agent = await createTestAgent(permitted)
      const { headers } = await createAgentToken(permitted, agent.id)
      await createAgentToken(permitted, agent.id)

      const result = await $fetch(`/api/agents/${agent.id}/suspend`, { method: 'POST', headers: permitted.headers }) as { revokedTokens: number }
      expect(result.revokedTokens).toBe(2)
      expect((await fetch(url('/api/projects'), { headers })).status).toBe(401)

      const detail = await $fetch(`/api/agents/${agent.id}`, { headers: permitted.headers }) as TestAgentDetail
      expect(detail).toMatchObject({ suspended: true, tokens: [] })
      await expectError($fetch(`/api/agents/${agent.id}/tokens`, { method: 'POST', body: { name: 'x' }, headers: permitted.headers }), 409)

      await $fetch(`/api/agents/${agent.id}/unsuspend`, { method: 'POST', headers: permitted.headers })
      const fresh = await createAgentToken(permitted, agent.id)
      expect((await fetch(url('/api/projects'), { headers: fresh.headers })).status).toBe(200)
    })

    it('lets only its manager or an admin suspend it', async () => {
      const agent = await createTestAgent(permitted)
      await expectError($fetch(`/api/agents/${agent.id}/suspend`, { method: 'POST', headers: plain.headers }), 404)
      await $fetch(`/api/agents/${agent.id}/suspend`, { method: 'POST', headers: admin.headers })
    })

    it('suspends in bulk for a manager of every agent named, and for admins', async () => {
      const a = await createTestAgent(permitted)
      const b = await createTestAgent(permitted)
      const someoneElses = await createTestAgent(admin)
      await expectError($fetch('/api/agents/suspend', { method: 'POST', body: { agentIds: [a.id, someoneElses.id] }, headers: permitted.headers }), 404)
      const result = await $fetch('/api/agents/suspend', { method: 'POST', body: { agentIds: [a.id, b.id] }, headers: permitted.headers }) as { agentIds: string[] }
      expect(result.agentIds.sort()).toEqual([a.id, b.id].sort())
      const list = await $fetch('/api/agents', { query: { status: 'suspended' }, headers: permitted.headers }) as TestAgent[]
      expect(list.map(x => x.id)).toEqual(expect.arrayContaining([a.id, b.id]))
    })
  })

  describe('GET /api/my-tasks/agents', () => {
    it('lists cards held by the caller\'s agents, with the agent on each card', async () => {
      const manager = await registerTestUser()
      await setCanCreateAgents(admin, manager, true)
      const project = await createTestProject(manager)
      const holding = await createTestAgent(manager)
      await createTestAgent(manager)
      await addMember(manager, project.id, holding.id)
      const board = await createTestBoard(manager, project.id)
      const statusId = (await getBoard(manager, board.id)).columns[0]!.id
      const card = await createTestCard(manager, project.id, statusId, { title: 'Agent work', assigneeId: holding.id })
      await createTestCard(manager, project.id, statusId, { title: 'Mine', assigneeId: manager.id })

      const work = await $fetch('/api/my-tasks/agents', { headers: manager.headers }) as {
        agentCount: number
        agentsWithCards: number
        cards: Array<{ id: number, assignee: { id: string, name: string, kind: string }, project: { id: string, key: string }, status: { name: string } }>
      }
      expect(work.agentCount).toBe(2)
      expect(work.agentsWithCards).toBe(1)
      expect(work.cards).toHaveLength(1)
      expect(work.cards[0]).toMatchObject({
        id: card.id,
        assignee: { id: holding.id, name: holding.name, kind: 'agent' },
        project: { id: project.id, key: project.key }
      })
    })

    it('is empty for someone who manages no agents', async () => {
      expect(await $fetch('/api/my-tasks/agents', { headers: plain.headers })).toEqual({ agentCount: 0, agentsWithCards: 0, cards: [] })
    })
  })

  it('accepts a person\'s own API token as well as a session for managing agents', async () => {
    const { headers } = await createTestToken(permitted)
    const agent = await createTestAgent({ ...permitted, headers })
    expect(agent.managedBy?.id).toBe(permitted.id)
  })
})
