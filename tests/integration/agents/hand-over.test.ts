import { describe, it, expect, beforeAll } from 'vitest'
import { $fetch, url, expectError } from '../../setup/server'
import { registerTestUser, createAdminUser, type TestUser } from '../../setup/auth'
import { createTestProject } from '../../setup/fixtures'
import { createTestAgent, createAgentToken, setCanCreateAgents, addMember, type TestAgent, type TestAgentDetail } from '../../setup/agents'

interface AdminUserRow { id: string, canCreateAgents: boolean, agentCount: number, activeAgentCount: number }

/**
 * A manager going away. The server refuses to delete, suspend or strip the
 * permission from someone who still manages active agents, until those agents
 * are handed over (transferred or suspended). Someone deleting their own account
 * cannot hand over, so that suspends their agents instead.
 */
describe('Agents: hand-over', () => {
  let admin: TestUser

  beforeAll(async () => {
    admin = await createAdminUser()
  })

  async function managerWithAgents(n: number) {
    const manager = await registerTestUser()
    await setCanCreateAgents(admin, manager, true)
    const agents: TestAgentDetail[] = []
    for (let i = 0; i < n; i++) agents.push(await createTestAgent(manager))
    return { manager, agents }
  }

  const patchUser = (id: string, body: Record<string, unknown>) =>
    fetch(url(`/api/admin/users/${id}`), {
      method: 'PATCH',
      headers: { ...admin.headers, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })

  it('lists people only in Admin › Users, with the permission and their agent counts', async () => {
    const { manager, agents } = await managerWithAgents(2)
    await $fetch(`/api/agents/${agents[0]!.id}/suspend`, { method: 'POST', headers: manager.headers })

    const users = await $fetch('/api/admin/users', { headers: admin.headers }) as AdminUserRow[]
    expect(users.map(u => u.id)).not.toContain(agents[0]!.id)
    expect(users.find(u => u.id === manager.id)).toMatchObject({ canCreateAgents: true, agentCount: 2, activeAgentCount: 1 })
    expect(users.find(u => u.id === admin.id)).toMatchObject({ canCreateAgents: false })
  })

  describe('refusing until the agents are handed over', () => {
    it('refuses to delete a manager of active agents, with the count', async () => {
      const { manager } = await managerWithAgents(2)
      const res = await fetch(url(`/api/user/${manager.id}`), { method: 'DELETE', headers: admin.headers })
      expect(res.status).toBe(409)
      const body = await res.json() as { message: string, data: { agentCount: number } }
      expect(body.data.agentCount).toBe(2)
      expect(body.message).toContain('2 active agents')
    })

    it('refuses to suspend one', async () => {
      const { manager } = await managerWithAgents(1)
      expect((await patchUser(manager.id, { suspended: true })).status).toBe(409)
    })

    it('refuses to revoke the permission from a non-admin who manages active agents', async () => {
      const { manager } = await managerWithAgents(1)
      expect((await patchUser(manager.id, { canCreateAgents: false })).status).toBe(409)
    })

    it('refuses to demote an admin without the permission, but not one who keeps it', async () => {
      const lead = await createAdminUser()
      await createTestAgent(lead)
      expect((await patchUser(lead.id, { isAdmin: false })).status).toBe(409)
      expect((await patchUser(lead.id, { isAdmin: false, canCreateAgents: true })).status).toBe(200)
    })

    it('does not count suspended agents', async () => {
      const { manager, agents } = await managerWithAgents(1)
      await $fetch(`/api/agents/${agents[0]!.id}/suspend`, { method: 'POST', headers: manager.headers })
      expect((await patchUser(manager.id, { canCreateAgents: false })).status).toBe(200)
    })
  })

  describe('POST /api/admin/users/:id/hand-over', () => {
    it('transfers every agent to one new manager, after which the delete goes through', async () => {
      const { manager, agents } = await managerWithAgents(2)
      const receiver = await registerTestUser()
      await setCanCreateAgents(admin, receiver, true)
      const project = await createTestProject(manager)
      await addMember(manager, project.id, agents[0]!.id)

      const preview = await $fetch(`/api/admin/users/${manager.id}/hand-over`, {
        method: 'POST',
        body: { action: 'transfer', toUserId: receiver.id, dryRun: true },
        headers: admin.headers
      }) as { removedFrom: Array<{ agentId: string, projectId: string }> }
      expect(preview.removedFrom).toEqual([expect.objectContaining({ agentId: agents[0]!.id, projectId: project.id })])

      const result = await $fetch(`/api/admin/users/${manager.id}/hand-over`, {
        method: 'POST',
        body: { action: 'transfer', toUserId: receiver.id },
        headers: admin.headers
      }) as { agentIds: string[], manager: { id: string }, removedFrom: unknown[] }
      expect(result.agentIds.sort()).toEqual(agents.map(a => a.id).sort())
      expect(result.manager.id).toBe(receiver.id)
      expect(result.removedFrom).toHaveLength(1)

      const mine = await $fetch('/api/agents', { headers: receiver.headers }) as TestAgent[]
      expect(mine.map(a => a.id).sort()).toEqual(agents.map(a => a.id).sort())
      await $fetch(`/api/user/${manager.id}`, { method: 'DELETE', headers: admin.headers })
    })

    it('suspends every agent and revokes their tokens, after which the suspension goes through', async () => {
      const { manager, agents } = await managerWithAgents(2)
      const { headers } = await createAgentToken(manager, agents[0]!.id)
      await createAgentToken(manager, agents[1]!.id)

      const result = await $fetch(`/api/admin/users/${manager.id}/hand-over`, {
        method: 'POST',
        body: { action: 'suspend' },
        headers: admin.headers
      }) as { revokedTokens: number }
      expect(result.revokedTokens).toBe(2)
      expect((await fetch(url('/api/projects'), { headers })).status).toBe(401)
      expect((await patchUser(manager.id, { suspended: true })).status).toBe(200)
    })

    it('is for admins, and refuses an unknown action or a recipient who cannot manage agents', async () => {
      const { manager } = await managerWithAgents(1)
      const plain = await registerTestUser()
      await expectError($fetch(`/api/admin/users/${manager.id}/hand-over`, { method: 'POST', body: { action: 'suspend' }, headers: manager.headers }), 403)
      await expectError($fetch(`/api/admin/users/${manager.id}/hand-over`, { method: 'POST', body: { action: 'delete' }, headers: admin.headers }), 400)
      await expectError($fetch(`/api/admin/users/${manager.id}/hand-over`, { method: 'POST', body: { action: 'transfer', toUserId: plain.id }, headers: admin.headers }), 400)
    })
  })

  describe('a manager deleting their own account', () => {
    it('suspends their agents, which then have no manager', async () => {
      const manager = await registerTestUser({ password: 'leaving123' })
      await setCanCreateAgents(admin, manager, true)
      const agent = await createTestAgent(manager)
      const { headers } = await createAgentToken(manager, agent.id)

      await $fetch('/api/user/account', { method: 'DELETE', body: { password: 'leaving123' }, headers: manager.headers })

      expect((await fetch(url('/api/projects'), { headers })).status).toBe(401)
      const orphans = await $fetch('/api/agents', { query: { scope: 'all', managerId: 'none' }, headers: admin.headers }) as TestAgent[]
      expect(orphans.find(a => a.id === agent.id)).toMatchObject({ suspended: true, managedBy: null, tokenCount: 0 })
    })
  })

  describe('unsuspending', () => {
    it('is refused while the agent has no manager; a transfer keeps it suspended for the new manager to wake', async () => {
      const manager = await registerTestUser({ password: 'leaving123' })
      await setCanCreateAgents(admin, manager, true)
      const agent = await createTestAgent(manager)
      await $fetch('/api/user/account', { method: 'DELETE', body: { password: 'leaving123' }, headers: manager.headers })

      await expectError($fetch(`/api/agents/${agent.id}/unsuspend`, { method: 'POST', headers: admin.headers }), 409)

      const receiver = await registerTestUser()
      await setCanCreateAgents(admin, receiver, true)
      await $fetch(`/api/agents/${agent.id}/transfer`, { method: 'POST', body: { toUserId: receiver.id }, headers: admin.headers })
      const moved = await $fetch(`/api/agents/${agent.id}`, { headers: receiver.headers }) as TestAgentDetail
      expect(moved).toMatchObject({ suspended: true, managedBy: { id: receiver.id } })

      await $fetch(`/api/agents/${agent.id}/unsuspend`, { method: 'POST', headers: receiver.headers })
      expect((await $fetch(`/api/agents/${agent.id}`, { headers: receiver.headers }) as TestAgentDetail).suspended).toBe(false)
    })

    it('is refused while the manager can no longer manage agents', async () => {
      const { manager, agents } = await managerWithAgents(1)
      await $fetch(`/api/agents/${agents[0]!.id}/suspend`, { method: 'POST', headers: manager.headers })
      await setCanCreateAgents(admin, manager, false)
      await expectError($fetch(`/api/agents/${agents[0]!.id}/unsuspend`, { method: 'POST', headers: manager.headers }), 409)
    })
  })
})
