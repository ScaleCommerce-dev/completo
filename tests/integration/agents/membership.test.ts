import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject, createTestBoard, getBoard, createTestCard } from '../../setup/fixtures'
import { createTestAgent, createAgentToken, setCanCreateAgents, addMember, type TestAgentDetail } from '../../setup/agents'

interface Member {
  id: string
  name: string
  email: string | null
  role: string
  kind: 'human' | 'agent'
  managedBy: { id: string, name: string } | null
  description: string | null
  suspended: boolean
  assignedCardCount: number | null
}

const members = (user: TestUser, projectId: string) =>
  $fetch(`/api/projects/${projectId}/members`, { headers: user.headers }) as Promise<Member[]>

/**
 * The membership invariant: an agent is only ever a member of projects its
 * manager is a member of (an admin's agents: any project). Checked on every
 * path that changes either side: adding, removing the manager, transfer, and
 * an admin manager losing admin.
 */
describe('Agents: project membership', () => {
  let admin: TestUser
  let manager: TestUser
  let owner: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
    manager = await registerTestUser()
    owner = await registerTestUser()
    await setCanCreateAgents(admin, manager, true)
  })

  describe('adding an agent', () => {
    it('is refused while the agent\'s manager is not a member', async () => {
      const project = await createTestProject(owner)
      const agent = await createTestAgent(manager)
      await expectError(addMember(owner, project.id, agent.id), 403)
      expect((await members(owner, project.id)).map(m => m.id)).not.toContain(agent.id)
    })

    it('is allowed once the manager is a member, always as a member', async () => {
      const project = await createTestProject(owner)
      const agent = await createTestAgent(manager, { description: 'Triages new bug reports' })
      await addMember(owner, project.id, manager.id)
      await addMember(owner, project.id, agent.id)

      const row = (await members(owner, project.id)).find(m => m.id === agent.id)!
      expect(row).toMatchObject({
        role: 'member',
        kind: 'agent',
        email: null,
        description: 'Triages new bug reports',
        suspended: false,
        managedBy: { id: manager.id, name: manager.name },
        assignedCardCount: 0
      })
      expect((await members(owner, project.id)).find(m => m.id === manager.id)).toMatchObject({ kind: 'human', managedBy: null, description: null })
    })

    it('lets an admin\'s agent join any project', async () => {
      const project = await createTestProject(owner)
      const agent = await createTestAgent(admin)
      await addMember(owner, project.id, agent.id)
      expect((await members(owner, project.id)).map(m => m.id)).toContain(agent.id)
    })

    it('is for whoever can add members: a plain member, even the agent\'s manager, cannot', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(manager)
      await expectError(addMember(manager, project.id, agent.id), 403)
    })

    it('refuses a suspended agent', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(manager)
      await $fetch(`/api/agents/${agent.id}/suspend`, { method: 'POST', headers: manager.headers })
      await expectError(addMember(owner, project.id, agent.id), 400)
    })
  })

  describe('agent candidates', () => {
    it('lists active non-member agents whose manager is a member or an admin, with the manager', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const eligible = await createTestAgent(manager)
      const adminsAgent = await createTestAgent(admin)
      const already = await createTestAgent(manager)
      await addMember(owner, project.id, already.id)
      const sleeping = await createTestAgent(manager)
      await $fetch(`/api/agents/${sleeping.id}/suspend`, { method: 'POST', headers: manager.headers })
      const outsiderManager = await registerTestUser()
      await setCanCreateAgents(admin, outsiderManager, true)
      const outsidersAgent = await createTestAgent(outsiderManager)

      const candidates = await $fetch(`/api/projects/${project.id}/agent-candidates`, { headers: owner.headers }) as Array<{ id: string, kind: string, managedBy: { id: string } }>
      const ids = candidates.map(c => c.id)
      expect(ids).toEqual(expect.arrayContaining([eligible.id, adminsAgent.id]))
      expect(ids).not.toContain(already.id)
      expect(ids).not.toContain(sleeping.id)
      expect(ids).not.toContain(outsidersAgent.id)
      expect(candidates.find(c => c.id === eligible.id)).toMatchObject({ kind: 'agent', managedBy: { id: manager.id } })

      const searched = await $fetch(`/api/projects/${project.id}/agent-candidates`, { query: { q: eligible.name }, headers: owner.headers }) as Array<{ id: string }>
      expect(searched.map(c => c.id)).toEqual([eligible.id])
    })

    it('is for project owners and admins', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      await expectError($fetch(`/api/projects/${project.id}/agent-candidates`, { headers: manager.headers }), 403)
      await $fetch(`/api/projects/${project.id}/agent-candidates`, { headers: admin.headers })
    })
  })

  describe('in the pickers', () => {
    it('shows a member agent in the board\'s member list with its kind, manager and description', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(manager, { description: 'Reviews pull requests' })
      await addMember(owner, project.id, agent.id)
      const board = await createTestBoard(owner, project.id)

      const view = await getBoard(owner, board.id)
      expect((view.members as Member[]).find(m => m.id === agent.id)).toMatchObject({
        kind: 'agent',
        description: 'Reviews pull requests',
        suspended: false,
        managedBy: { id: manager.id, name: manager.name }
      })
      const card = await createTestCard(owner, project.id, view.columns[0]!.id, { assigneeId: agent.id })
      const detail = await $fetch(`/api/cards/${card.id}`, { headers: owner.headers }) as { assignee: Record<string, unknown>, members: Member[] }
      expect(detail.assignee).toMatchObject({ id: agent.id, kind: 'agent', managedBy: { id: manager.id } })
      expect(detail.members.find(m => m.id === agent.id)).toMatchObject({ kind: 'agent' })

      const search = await $fetch('/api/users/search', { query: { q: agent.name }, headers: owner.headers }) as Array<Record<string, unknown>>
      expect(search).toEqual([{ id: agent.id, name: agent.name, avatarUrl: null, kind: 'agent', color: null, managedBy: { id: manager.id, name: manager.name, avatarUrl: null } }])
    })

    it('leaves a suspended agent out of user search', async () => {
      const agent = await createTestAgent(manager)
      await $fetch(`/api/agents/${agent.id}/suspend`, { method: 'POST', headers: manager.headers })
      expect(await $fetch('/api/users/search', { query: { q: agent.name }, headers: owner.headers })).toEqual([])
    })
  })

  describe('removing', () => {
    it('takes the manager\'s agents out with them, unassigning their cards and the agents\' there', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(manager)
      await addMember(owner, project.id, agent.id)
      const board = await createTestBoard(owner, project.id)
      const statusId = (await getBoard(owner, board.id)).columns[0]!.id
      const card = await createTestCard(owner, project.id, statusId, { assigneeId: agent.id })
      const humanCard = await createTestCard(owner, project.id, statusId, { assigneeId: manager.id })
      expect((await members(owner, project.id)).find(m => m.id === agent.id)!.assignedCardCount).toBe(1)

      const result = await $fetch(`/api/projects/${project.id}/members/${manager.id}`, { method: 'DELETE', headers: owner.headers }) as { removedAgents: Array<{ id: string }>, unassignedCards: number }
      expect(result.removedAgents.map(a => a.id)).toEqual([agent.id])
      // The manager's own card and the agent's.
      expect(result.unassignedCards).toBe(2)

      expect((await members(owner, project.id)).map(m => m.id)).not.toContain(agent.id)
      expect((await $fetch(`/api/cards/${card.id}`, { headers: owner.headers }) as { assigneeId: string | null }).assigneeId).toBeNull()
      // A person who leaves is unassigned too, so they drop off the card's notifications.
      expect((await $fetch(`/api/cards/${humanCard.id}`, { headers: owner.headers }) as { assigneeId: string | null }).assigneeId).toBeNull()
    })

    it('lets a manager take their own agent out of a project they are only a member of', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(manager)
      await addMember(owner, project.id, agent.id)
      const other = await registerTestUser()
      await addMember(owner, project.id, other.id)

      await expectError($fetch(`/api/projects/${project.id}/members/${other.id}`, { method: 'DELETE', headers: manager.headers }), 403)
      await $fetch(`/api/projects/${project.id}/members/${agent.id}`, { method: 'DELETE', headers: manager.headers })
      expect((await members(owner, project.id)).map(m => m.id)).not.toContain(agent.id)
    })
  })

  describe('transfer', () => {
    it('is for admins only', async () => {
      const agent = await createTestAgent(manager)
      await expectError($fetch(`/api/agents/${agent.id}/transfer`, { method: 'POST', body: { toUserId: admin.id }, headers: manager.headers }), 403)
      await expectError($fetch('/api/agents/transfer', { method: 'POST', body: { agentIds: [agent.id], toUserId: admin.id }, headers: manager.headers }), 403)
    })

    it('drops the projects the new manager is not in, and says which', async () => {
      const keep = await createTestProject(owner)
      const lose = await createTestProject(owner)
      const receiver = await registerTestUser()
      await setCanCreateAgents(admin, receiver, true)
      for (const p of [keep, lose]) await addMember(owner, p.id, manager.id)
      await addMember(owner, keep.id, receiver.id)
      const agent = await createTestAgent(manager)
      for (const p of [keep, lose]) await addMember(owner, p.id, agent.id)

      const preview = await $fetch(`/api/agents/${agent.id}/transfer`, { method: 'POST', body: { toUserId: receiver.id, dryRun: true }, headers: admin.headers }) as { removedFrom: Array<{ agentId: string, projectId: string }> }
      expect(preview.removedFrom).toEqual([expect.objectContaining({ agentId: agent.id, projectId: lose.id, projectName: lose.name })])
      expect((await members(owner, lose.id)).map(m => m.id)).toContain(agent.id)

      const result = await $fetch(`/api/agents/${agent.id}/transfer`, { method: 'POST', body: { toUserId: receiver.id }, headers: admin.headers }) as { managedBy: { id: string }, removedFrom: Array<{ projectId: string }> }
      expect(result.managedBy.id).toBe(receiver.id)
      expect(result.removedFrom.map(r => r.projectId)).toEqual([lose.id])
      expect((await members(owner, lose.id)).map(m => m.id)).not.toContain(agent.id)
      expect((await members(owner, keep.id)).map(m => m.id)).toContain(agent.id)

      const detail = await $fetch(`/api/agents/${agent.id}`, { headers: receiver.headers }) as TestAgentDetail
      expect(detail.managedBy?.id).toBe(receiver.id)
      await expectError($fetch(`/api/agents/${agent.id}`, { headers: manager.headers }), 404)
    })

    it('transfers in bulk, and to an admin keeps every project', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const a = await createTestAgent(manager)
      const b = await createTestAgent(manager)
      for (const agent of [a, b]) await addMember(owner, project.id, agent.id)

      const result = await $fetch('/api/agents/transfer', { method: 'POST', body: { agentIds: [a.id, b.id], toUserId: admin.id }, headers: admin.headers }) as { agentIds: string[], removedFrom: unknown[] }
      expect(result.agentIds.sort()).toEqual([a.id, b.id].sort())
      expect(result.removedFrom).toEqual([])
      expect((await members(owner, project.id)).filter(m => m.kind === 'agent').map(m => m.managedBy?.id)).toEqual([admin.id, admin.id])
    })

    it('refuses a new manager who cannot manage agents', async () => {
      const agent = await createTestAgent(manager)
      const plain = await registerTestUser()
      await expectError($fetch(`/api/agents/${agent.id}/transfer`, { method: 'POST', body: { toUserId: plain.id }, headers: admin.headers }), 400)
      await expectError($fetch(`/api/agents/${agent.id}/transfer`, { method: 'POST', body: { toUserId: agent.id }, headers: admin.headers }), 400)
    })

    it('previews each candidate\'s cost in the managers list', async () => {
      const project = await createTestProject(owner)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(manager)
      await addMember(owner, project.id, agent.id)

      const candidates = await $fetch('/api/agents/managers', { query: { agentIds: agent.id }, headers: admin.headers }) as Array<{ id: string, isAdmin: boolean, removedFrom: Array<{ projectId: string }> }>
      expect(candidates.find(c => c.id === manager.id)!.removedFrom).toEqual([])
      expect(candidates.find(c => c.id === admin.id)).toMatchObject({ isAdmin: true, removedFrom: [] })
      const outsider = await registerTestUser()
      await setCanCreateAgents(admin, outsider, true)
      const again = await $fetch('/api/agents/managers', { query: { agentIds: agent.id }, headers: admin.headers }) as typeof candidates
      expect(again.find(c => c.id === outsider.id)!.removedFrom.map(r => r.projectId)).toEqual([project.id])
      await expectError($fetch('/api/agents/managers', { headers: manager.headers }), 403)
    })
  })

  describe('an admin manager losing admin', () => {
    it('keeps their agents only in projects they are a member of', async () => {
      const exAdmin = await createAdminUser()
      const own = await createTestProject(exAdmin)
      const foreign = await createTestProject(owner)
      const agent = await createTestAgent(exAdmin)
      await addMember(exAdmin, own.id, agent.id)
      await addMember(owner, foreign.id, agent.id)

      await $fetch(`/api/admin/users/${exAdmin.id}`, { method: 'PATCH', body: { canCreateAgents: true }, headers: admin.headers })
      const result = await $fetch(`/api/admin/users/${exAdmin.id}`, { method: 'PATCH', body: { isAdmin: false }, headers: admin.headers }) as { removedFrom: Array<{ projectId: string }> }
      expect(result.removedFrom.map(r => r.projectId)).toEqual([foreign.id])
      expect((await members(owner, foreign.id)).map(m => m.id)).not.toContain(agent.id)
      expect((await members(exAdmin, own.id)).map(m => m.id)).toContain(agent.id)
    })

    it('prunes suspended agents too, so granting the permission and unsuspending cannot reopen a foreign project', async () => {
      const exAdmin = await createAdminUser()
      const foreign = await createTestProject(owner)
      const agent = await createTestAgent(exAdmin)
      await addMember(owner, foreign.id, agent.id)
      await $fetch(`/api/agents/${agent.id}/suspend`, { method: 'POST', headers: exAdmin.headers })

      // No active agents, so neither the demotion nor the later grant needs a hand-over.
      await $fetch(`/api/admin/users/${exAdmin.id}`, { method: 'PATCH', body: { isAdmin: false }, headers: admin.headers })
      await $fetch(`/api/admin/users/${exAdmin.id}`, { method: 'PATCH', body: { canCreateAgents: true }, headers: admin.headers })
      await $fetch(`/api/agents/${agent.id}/unsuspend`, { method: 'POST', headers: exAdmin.headers })
      const { headers } = await createAgentToken(exAdmin, agent.id)

      expect((await members(owner, foreign.id)).map(m => m.id)).not.toContain(agent.id)
      await expectError($fetch(`/api/projects/${foreign.id}/members`, { headers }), 404)
    })
  })

  describe('removing an admin manager', () => {
    it('keeps their agents, and tells the owner who is an admin so the confirmation can say so', async () => {
      const project = await createTestProject(owner)
      const lead = await createAdminUser()
      await addMember(owner, project.id, lead.id)
      await addMember(owner, project.id, manager.id)
      const agent = await createTestAgent(lead)
      await addMember(owner, project.id, agent.id)

      const seen = await members(owner, project.id) as Array<Member & { isAdmin?: boolean }>
      expect(seen.find(m => m.id === lead.id)!.isAdmin).toBe(true)
      expect(seen.find(m => m.id === manager.id)!.isAdmin).toBe(false)
      // Only whoever can remove people needs to know; a plain member is not told.
      const plain = await members(manager, project.id) as Array<Member & { isAdmin?: boolean }>
      expect(plain.find(m => m.id === lead.id)!.isAdmin).toBeUndefined()

      const result = await $fetch(`/api/projects/${project.id}/members/${lead.id}`, { method: 'DELETE', headers: owner.headers }) as { removedAgents: unknown[] }
      expect(result.removedAgents).toEqual([])
      expect((await members(owner, project.id)).map(m => m.id)).toContain(agent.id)
    })
  })

  it('keeps an agent token working on a project the agent belongs to', async () => {
    const project = await createTestProject(owner)
    await addMember(owner, project.id, manager.id)
    const agent = await createTestAgent(manager)
    await addMember(owner, project.id, agent.id)
    const { headers } = await createAgentToken(manager, agent.id)
    const list = await $fetch(`/api/projects/${project.id}/members`, { headers }) as Member[]
    expect(list.map(m => m.id)).toContain(agent.id)
  })
})
