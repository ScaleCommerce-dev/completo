import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard, mention } from '../../setup/fixtures'
import { createTestAgent, createAgentToken, setCanCreateAgents, addMember, asMentionable, type TestAgentDetail } from '../../setup/agents'

interface SentCardEmail { to: string, userId: string, kind: 'assigned' | 'mentioned', cardId: number }

/**
 * What an agent can never do, each checked through the endpoint that would do
 * it: sign in by any route, be admin or project owner, create projects, manage
 * members, receive email or notifications, or have its synthetic address shown.
 */
describe('Agents: guardrails', () => {
  let admin: TestUser
  let manager: TestUser
  let colleague: TestUser
  let agent: TestAgentDetail
  let agentHeaders: Record<string, string>
  let project: { id: string, slug: string }
  let statusId: string

  const sent = () => $fetch('/api/_test/card-emails?clear=1') as Promise<SentCardEmail[]>

  beforeAll(async () => {
    admin = await createAdminUser()
    manager = await registerTestUser()
    colleague = await registerTestUser()
    await setCanCreateAgents(admin, manager, true)
    project = await createTestProject(manager)
    await addMember(manager, project.id, colleague.id)
    agent = await createTestAgent(manager, { description: 'Implements backlog cards' })
    await addMember(manager, project.id, agent.id)
    agentHeaders = (await createAgentToken(manager, agent.id)).headers
    const board = await createTestBoard(manager, project.id)
    statusId = (await getBoard(manager, board.id)).columns[0]!.id
  })

  describe('signing in', () => {
    const post = (path: string, body: unknown) => fetch(url(path), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })

    it('refuses a password login exactly like a wrong password', async () => {
      const res = await post('/auth/login', { email: agent.email, password: '!agent' })
      expect(res.status).toBe(401)
      expect(res.headers.get('set-cookie')).toBeNull()
    })

    it('issues no reset token for an agent\'s address', async () => {
      const res = await post('/auth/forgot-password', { email: agent.email })
      expect(res.status).toBe(200)
      const { token } = await $fetch('/api/_test/get-verification-token', { query: { userId: agent.id } }) as { token: string | null }
      expect(token).toBeNull()
    })

    it('issues no verification token for an agent\'s address', async () => {
      const res = await post('/auth/resend-verification', { email: agent.email })
      expect(res.status).toBe(200)
      const { token } = await $fetch('/api/_test/get-verification-token', { query: { userId: agent.id } }) as { token: string | null }
      expect(token).toBeNull()
    })

    it('does nothing for a sign-up with an agent\'s address', async () => {
      const res = await post('/auth/register', { name: 'Impostor', email: agent.email, password: 'password123' })
      expect(res.status).toBe(200)
      const { token } = await $fetch('/api/_test/get-verification-token', { query: { userId: agent.id } }) as { token: string | null }
      expect(token).toBeNull()
    })

    it('refuses the endpoints that change a password or delete the account', async () => {
      await expectError($fetch('/api/user/password', { method: 'PUT', body: { currentPassword: '!agent', newPassword: 'password123' }, headers: agentHeaders }), 403)
      await expectError($fetch('/api/user/account', { method: 'DELETE', body: { password: '!agent' }, headers: agentHeaders }), 403)
      await expectError($fetch('/api/user/profile', { method: 'PUT', body: { name: 'Renamed by itself' }, headers: agentHeaders }), 403)
    })
  })

  describe('privileges', () => {
    it('cannot create a project', async () => {
      await expectError($fetch('/api/projects', { method: 'POST', body: { name: 'Agent project', key: 'AGNT' }, headers: agentHeaders }), 403)
    })

    it('cannot be promoted to admin or allowed to create agents', async () => {
      await expectError($fetch(`/api/admin/users/${agent.id}`, { method: 'PATCH', body: { isAdmin: true }, headers: admin.headers }), 400)
      await expectError($fetch(`/api/admin/users/${agent.id}`, { method: 'PATCH', body: { canCreateAgents: true }, headers: admin.headers }), 400)
    })

    it('is never an admin, even with is_admin set on its row', async () => {
      const other = await createTestAgent(manager)
      const { headers } = await createAgentToken(manager, other.id)
      // Writes the column directly, as a bug or a hand edit would.
      await $fetch('/api/_test/promote-admin', { method: 'POST', body: { userId: other.id }, headers: admin.headers })
      await expectError($fetch('/api/admin/users', { headers }), 403)
      const projects = await $fetch('/api/projects', { headers }) as unknown[]
      expect(projects).toEqual([])
    })

    it('cannot be made a project owner', async () => {
      await expectError($fetch(`/api/projects/${project.id}/members/${agent.id}`, { method: 'PATCH', body: { role: 'owner' }, headers: manager.headers }), 400)
    })

    it('cannot add, change or remove members', async () => {
      const outsider = await registerTestUser()
      await expectError($fetch(`/api/projects/${project.id}/members`, { method: 'POST', body: { userId: outsider.id }, headers: agentHeaders }), 403)
      await expectError($fetch(`/api/projects/${project.id}/members/${colleague.id}`, { method: 'PATCH', body: { role: 'owner' }, headers: agentHeaders }), 403)
      await expectError($fetch(`/api/projects/${project.id}/members/${colleague.id}`, { method: 'DELETE', headers: agentHeaders }), 403)
    })

    it('is not managed through the people endpoints', async () => {
      await expectError($fetch(`/api/admin/users/${agent.id}`, { method: 'PATCH', body: { suspended: true }, headers: admin.headers }), 400)
      await expectError($fetch(`/api/user/${agent.id}`, { method: 'DELETE', headers: admin.headers }), 400)
    })
  })

  describe('email and notifications', () => {
    beforeEach(async () => {
      await sent()
    })

    it('never emails or notifies an agent that is assigned a card or mentioned', async () => {
      const card = await createTestCard(manager, project.id, statusId, { title: 'For the agent', assigneeId: agent.id })
      await $fetch(`/api/cards/${card.id}`, { method: 'PUT', body: { description: `Over to you ${mention(asMentionable(agent))}` }, headers: colleague.headers })
      await $fetch(`/api/cards/${card.id}/comments`, { method: 'POST', body: { body: `Ping ${mention(asMentionable(agent))}` }, headers: colleague.headers })

      expect((await sent()).filter(e => e.userId === agent.id)).toEqual([])
      expect(await $fetch('/api/notifications', { headers: agentHeaders })).toEqual([])
    })

    it('drops an agent at the email exit guard by kind, even with its email flag on', async () => {
      // Agents are created with email notifications off, which would hide a missing
      // kind check; turn the flag on the way a bug or a hand edit could.
      await $fetch('/api/_test/set-email-notifications', { method: 'POST', body: { userId: agent.id, on: true } })
      const recipients = await $fetch('/api/_test/card-email-recipients', {
        method: 'POST',
        body: { projectId: project.id, userIds: [agent.id, colleague.id] }
      }) as Record<string, string>
      expect(Object.keys(recipients)).toEqual([colleague.id])
    })

    it('emails and notifies a person the agent mentions, naming the agent as the actor', async () => {
      const card = await createTestCard(manager, project.id, statusId, { title: 'Pagination' })
      await $fetch(`/api/cards/${card.id}/comments`, {
        method: 'POST',
        body: { body: `${mention(colleague)} pagination is in.` },
        headers: agentHeaders
      })

      expect(await sent()).toEqual([
        expect.objectContaining({ to: colleague.email, userId: colleague.id, kind: 'mentioned', cardId: card.id })
      ])
      const notifications = await $fetch('/api/notifications', { headers: colleague.headers }) as Array<Record<string, unknown>>
      expect(notifications.find(n => n.type === 'mentioned' && n.cardId === card.id)).toMatchObject({
        type: 'mentioned',
        actorId: agent.id,
        actorName: agent.name,
        actorKind: 'agent',
        actorManagedBy: { id: manager.id, name: manager.name }
      })
    })

    it('emails a person the agent assigns a card to', async () => {
      const card = await createTestCard({ ...manager, headers: agentHeaders }, project.id, statusId, { title: 'Review this', assigneeId: colleague.id })
      expect(await sent()).toEqual([expect.objectContaining({ to: colleague.email, kind: 'assigned', cardId: card.id })])
    })

    it('sends no member-added notification to an agent', async () => {
      const second = await createTestProject(manager)
      await addMember(manager, second.id, agent.id)
      expect(await $fetch('/api/notifications', { headers: agentHeaders })).toEqual([])
    })
  })

  describe('the synthetic address', () => {
    it('appears in no response a person reads, except the agent\'s own page', async () => {
      const card = await createTestCard(manager, project.id, statusId, { assigneeId: agent.id })
      await $fetch(`/api/cards/${card.id}/comments`, { method: 'POST', body: { body: 'Working on it' }, headers: agentHeaders })
      await $fetch(`/api/cards/${card.id}/comments`, { method: 'POST', body: { body: `${mention(colleague)} done` }, headers: agentHeaders })
      const board = await createTestBoard(manager, project.id)

      const responses = await Promise.all([
        $fetch(`/api/projects/${project.id}/members`, { headers: colleague.headers }),
        $fetch('/api/users/search', { query: { q: agent.name.slice(0, 8) }, headers: colleague.headers }),
        $fetch(`/api/cards/${card.id}`, { headers: colleague.headers }),
        $fetch(`/api/cards/${card.id}/comments`, { headers: colleague.headers }),
        $fetch(`/api/boards/${board.id}`, { headers: colleague.headers }),
        $fetch(`/api/projects/${project.id}/cards`, { headers: colleague.headers }),
        $fetch('/api/notifications', { headers: colleague.headers }),
        $fetch('/api/my-tasks/agents', { headers: manager.headers }),
        $fetch('/api/agents', { headers: manager.headers }),
        $fetch('/api/admin/users', { headers: admin.headers }),
        $fetch('/api/projects', { headers: colleague.headers })
      ])
      for (const body of responses) {
        expect(JSON.stringify(body)).not.toContain(agent.email)
      }

      const detail = await $fetch(`/api/agents/${agent.id}`, { headers: manager.headers }) as TestAgentDetail
      expect(detail.email).toBe(agent.email)
    })

    it('is returned to the agent itself in the member list, which is what the CLI\'s --me matches', async () => {
      const members = await $fetch(`/api/projects/${project.id}/members`, { headers: agentHeaders }) as Array<{ id: string, email: string | null }>
      expect(members.find(m => m.id === agent.id)!.email).toBe(agent.email)
      expect(members.find(m => m.id === colleague.id)!.email).toBe(colleague.email)
    })
  })
})
