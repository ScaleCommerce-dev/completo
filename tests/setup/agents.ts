import { $fetch } from './server'
import { tokenHeaders, type TestUser } from './auth'

let agentCounter = 0

export interface TestAgentRef {
  id: string
  name: string
  avatarUrl: string | null
  kind: 'human' | 'agent'
  color: string | null
  managedBy: { id: string, name: string, avatarUrl: string | null } | null
}

export interface TestAgent extends TestAgentRef {
  description: string | null
  suspended: boolean
  lastSeenAt: string | null
  projectCount: number
  projects: Array<{ id: string, name: string, slug: string, key: string, role: string }>
  tokenCount: number
}

export interface TestAgentDetail extends TestAgent {
  email: string
  tokens: Array<{ id: string, name: string, tokenPrefix: string, expiresAt: string | null, lastUsedAt: string | null }>
  assignedCardCount: number
}

/** Agent names are unique instance-wide, so every test agent gets its own. */
export function uniqueAgentName(prefix = 'Agent'): string {
  agentCounter++
  return `${prefix} ${agentCounter}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export async function createTestAgent(creator: TestUser, overrides?: { name?: string, description?: string, color?: string }) {
  return await $fetch('/api/agents', {
    method: 'POST',
    body: {
      name: overrides?.name ?? uniqueAgentName(),
      description: overrides?.description,
      color: overrides?.color
    },
    headers: creator.headers
  }) as TestAgentDetail
}

/** A token for an agent, minted by its manager or an admin, with ready-made headers. */
export async function createAgentToken(manager: TestUser, agentId: string, name = `Agent token ${Date.now()}`) {
  const result = await $fetch(`/api/agents/${agentId}/tokens`, {
    method: 'POST',
    body: { name },
    headers: manager.headers
  }) as { id: string, token: string, tokenPrefix: string }
  return { ...result, headers: tokenHeaders(result.token) }
}

/** Let a non-admin create agents, or take that away. */
export async function setCanCreateAgents(admin: TestUser, user: TestUser, on: boolean) {
  return await $fetch(`/api/admin/users/${user.id}`, {
    method: 'PATCH',
    body: { canCreateAgents: on },
    headers: admin.headers
  })
}

export async function addMember(owner: TestUser, projectId: string, userId: string) {
  return await $fetch(`/api/projects/${projectId}/members`, {
    method: 'POST',
    body: { userId },
    headers: owner.headers
  })
}

/** An agent in the shape `mention()` takes, so it can be @mentioned in text. */
export function asMentionable(agent: { id: string, name: string }): TestUser {
  return { id: agent.id, name: agent.name, email: '', cookie: '', headers: {} }
}
