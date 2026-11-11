import { describe, it, expect } from 'vitest'
// The pure rules only: `db`, `schema` and `createError` are Nitro auto-imports and
// undefined here, and none of these functions touches them.
import { agentEmail, canManageAgents, agentMayJoinProject, projectsLostOnTransfer } from '../../server/utils/agents'

describe('agentEmail', () => {
  it('slugs the name onto the reserved agents.invalid domain', () => {
    expect(agentEmail('Release Bot', '3f2a')).toBe('release-bot-3f2a@agents.invalid')
  })

  it('folds accents and drops anything that is not a letter or digit', () => {
    expect(agentEmail('  Café Crème (EU) ', '0a1b')).toBe('cafe-creme-eu-0a1b@agents.invalid')
  })

  it('falls back to "agent" for a name with nothing usable in it', () => {
    expect(agentEmail('🤖', 'ffff')).toBe('agent-ffff@agents.invalid')
  })

  it('keeps the local part short without ending on a dash', () => {
    const local = agentEmail(`${'a'.repeat(39)} tail`, '1234').split('@')[0]!
    expect(local).toBe(`${'a'.repeat(39)}-1234`)
  })
})

describe('canManageAgents', () => {
  const person = { kind: 'human', isAdmin: 0, canCreateAgents: 0, suspendedAt: null }

  it('is true for an admin and for a person with the permission', () => {
    expect(canManageAgents({ ...person, isAdmin: 1 })).toBe(true)
    expect(canManageAgents({ ...person, canCreateAgents: 1 })).toBe(true)
  })

  it('is false for a person with neither', () => {
    expect(canManageAgents(person)).toBe(false)
  })

  it('is false for a suspended person, whatever they hold', () => {
    expect(canManageAgents({ ...person, isAdmin: 1, canCreateAgents: 1, suspendedAt: new Date() })).toBe(false)
  })

  it('is false for an agent, whatever its row says', () => {
    expect(canManageAgents({ ...person, kind: 'agent', isAdmin: 1, canCreateAgents: 1 })).toBe(false)
  })
})

describe('agentMayJoinProject', () => {
  it('admits an agent whose manager is a member', () => {
    expect(agentMayJoinProject({ kind: 'human', isAdmin: 0 }, true)).toBe(true)
  })

  it('refuses one whose manager is not', () => {
    expect(agentMayJoinProject({ kind: 'human', isAdmin: 0 }, false)).toBe(false)
  })

  it('admits an admin\'s agent anywhere', () => {
    expect(agentMayJoinProject({ kind: 'human', isAdmin: 1 }, false)).toBe(true)
  })

  it('refuses an agent with no manager, or one "managed" by an agent', () => {
    expect(agentMayJoinProject(null, true)).toBe(false)
    expect(agentMayJoinProject({ kind: 'agent', isAdmin: 1 }, true)).toBe(false)
  })
})

describe('projectsLostOnTransfer', () => {
  it('drops every project the new manager is not in', () => {
    expect(projectsLostOnTransfer(['a', 'b', 'c'], { isAdmin: 0, projectIds: new Set(['b']) })).toEqual(['a', 'c'])
  })

  it('drops nothing for an admin', () => {
    expect(projectsLostOnTransfer(['a', 'b'], { isAdmin: 1, projectIds: new Set() })).toEqual([])
  })
})
