import { describe, it, expect } from 'vitest'
import {
  groupForPicker,
  groupByManager,
  filterAgents,
  agentCountLabel,
  summarizeNames,
  lossesByProject,
  lossLabel,
  sortAgentWork,
  OTHER_AGENTS_SHOWN
} from '../../app/utils/people'

const me = { id: 'me', name: 'Florian Seidl', avatarUrl: null }
const jonas = { id: 'jonas', name: 'Jonas Weber', avatarUrl: null }
const mara = { id: 'mara', name: 'Mara Lindqvist', avatarUrl: null }

const person = (id: string, name: string) => ({ id, name, kind: 'human' as const })
interface TestAgent {
  id: string
  name: string
  kind: 'agent'
  managedBy: typeof me | null
  suspended?: boolean
  lastSeenAt?: string | null
  description?: string | null
  tokenCount?: number
}

const agent = (id: string, name: string, extra: Partial<TestAgent> = {}): TestAgent =>
  ({ id, name, kind: 'agent', managedBy: jonas, ...extra })

describe('person pickers', () => {
  const members = [
    person('p2', 'Mara Lindqvist'),
    person('p1', 'Florian Seidl'),
    agent('a1', 'Claude', { managedBy: me }),
    agent('a2', 'Changelog', { managedBy: me }),
    agent('o1', 'Reviewer', { lastSeenAt: '2026-11-03T10:00:00Z' }),
    agent('o2', 'Scout', { lastSeenAt: '2026-11-03T09:00:00Z', description: 'Triages new bug reports' }),
    agent('o3', 'Bug Triage', { lastSeenAt: '2026-11-02T09:00:00Z' }),
    agent('o4', 'Perf Sampler', { lastSeenAt: '2026-10-01T09:00:00Z' }),
    agent('o5', 'Never Ran', { lastSeenAt: null }),
    agent('s1', 'Release Bot', { suspended: true, lastSeenAt: '2026-11-03T11:00:00Z' })
  ]

  it('puts people first and never caps them, then your agents, then the rest', () => {
    const g = groupForPicker(members, { currentUserId: 'me' })
    expect(g.people.map(p => p.name)).toEqual(['Florian Seidl', 'Mara Lindqvist'])
    expect(g.mine.map(p => p.name)).toEqual(['Changelog', 'Claude'])
    expect(g.others.map(p => p.name)).toEqual(['Reviewer', 'Scout', 'Bug Triage'])
  })

  it('shows only the most recently active other agents until a search asks for the rest', () => {
    const g = groupForPicker(members, { currentUserId: 'me' })
    expect(g.others).toHaveLength(OTHER_AGENTS_SHOWN)
    expect(g.othersTotal).toBe(5)
    expect(g.othersHidden).toBe(2)
  })

  it('leaves suspended agents out, unless one is the current value', () => {
    expect(groupForPicker(members, { currentUserId: 'me' }).others.map(p => p.id)).not.toContain('s1')

    const kept = groupForPicker(members, { currentUserId: 'me', keepIds: ['s1', 'o5'] })
    expect(kept.others.map(p => p.id)).toContain('s1')
    // A kept agent past the cap is shown too, so the selection is never hidden.
    expect(kept.others.map(p => p.id)).toContain('o5')
  })

  it('searches every group by name, and agents by description too, uncapped', () => {
    const g = groupForPicker(members, { currentUserId: 'me', query: 'r' })
    expect(g.people.map(p => p.name)).toEqual(['Florian Seidl', 'Mara Lindqvist'])
    expect(g.others.map(p => p.name)).toEqual(['Bug Triage', 'Never Ran', 'Perf Sampler', 'Reviewer', 'Scout'])
    expect(g.othersHidden).toBe(0)

    expect(groupForPicker(members, { query: 'triages' }).others.map(p => p.name)).toEqual(['Scout'])
  })

  it('treats every agent as someone else\'s when nobody is signed in', () => {
    expect(groupForPicker(members, {}).mine).toEqual([])
  })

  describe('grouped or one plain list', () => {
    const people = [person('p1', 'Florian Seidl'), person('p2', 'Mara Lindqvist')]
    const sleeping = agent('s1', 'Release Bot', { suspended: true })

    it('groups once any agent can be listed', () => {
      expect(groupForPicker(members, { currentUserId: 'me' }).hasAgents).toBe(true)
      expect(groupForPicker(people, { currentUserId: 'me' }).hasAgents).toBe(false)
    })

    it('stays one plain list when the only agents are suspended', () => {
      expect(groupForPicker([...people, sleeping], { currentUserId: 'me' }).hasAgents).toBe(false)
    })

    it('groups, and lists it, when a suspended sole agent is the current value', () => {
      const g = groupForPicker([...people, sleeping], { currentUserId: 'me', keepIds: ['s1'] })
      expect(g.hasAgents).toBe(true)
      expect(g.others.map(p => p.id)).toEqual(['s1'])
    })

    it('does not flip between the two while a search narrows the list', () => {
      expect(groupForPicker(members, { currentUserId: 'me', query: 'mara' }).hasAgents).toBe(true)
      expect(groupForPicker([...people, sleeping], { currentUserId: 'me', keepIds: ['s1'], query: 'mara' }).hasAgents).toBe(true)
    })
  })
})

describe('the Agents page', () => {
  const agents = [
    agent('a', 'Claude', { managedBy: me, tokenCount: 2 }),
    agent('b', 'Changelog', { managedBy: me, tokenCount: 0 }),
    agent('c', 'Scout', { managedBy: mara, tokenCount: 1 }),
    agent('d', 'Bug Triage', { managedBy: jonas, suspended: true, tokenCount: 0 }),
    agent('e', 'Release Bot', { managedBy: null, suspended: true, tokenCount: 0 })
  ]

  it('groups by manager: no manager first, then you, then A to Z', () => {
    const groups = groupByManager(agents, 'me')
    expect(groups.map(g => g.key)).toEqual(['none', 'me', 'jonas', 'mara'])
    expect(groups[1]!.isYou).toBe(true)
    expect(groups[1]!.agents.map(a => a.name)).toEqual(['Changelog', 'Claude'])
  })

  it('counts what each group header reports', () => {
    const [none, mine, jonasGroup] = groupByManager(agents, 'me')
    expect(none!.suspended).toBe(1)
    // A suspended agent has no tokens by construction, so it is not also "without a token".
    expect(jonasGroup!.withoutToken).toBe(0)
    expect(mine!.withoutToken).toBe(1)
  })

  it('filters by query, manager and status', () => {
    expect(filterAgents(agents, { managerId: 'none' }).map(a => a.id)).toEqual(['e'])
    expect(filterAgents(agents, { managerId: 'mara' }).map(a => a.id)).toEqual(['c'])
    expect(filterAgents(agents, { status: 'suspended' }).map(a => a.id)).toEqual(['d', 'e'])
    expect(filterAgents(agents, { status: 'no-token' }).map(a => a.id)).toEqual(['b'])
    expect(filterAgents(agents, { status: 'active', query: 'cl' }).map(a => a.id)).toEqual(['a'])
  })

  it('labels the Admin › Users count', () => {
    expect(agentCountLabel(0)).toBe('None')
    expect(agentCountLabel(1)).toBe('1 agent')
    expect(agentCountLabel(24)).toBe('24 agents')
  })

  it('summarises a long list of names', () => {
    expect(summarizeNames(['Scout', 'Bug Triage'])).toBe('Scout, Bug Triage')
    expect(summarizeNames(['Scout', 'Bug Triage', 'Scout EU', 'Crash Sorter', 'Log Reader'])).toBe('Scout, Bug Triage, Scout EU and 2 more')
  })
})

describe('what a transfer costs', () => {
  const lost = [
    { agentId: 'a', agentName: 'Log Reader', projectId: 'web', projectName: 'Website' },
    { agentId: 'b', agentName: 'Flaky Test Hunter', projectId: 'web', projectName: 'Website' },
    { agentId: 'b', agentName: 'Flaky Test Hunter', projectId: 'infra', projectName: 'Infra' },
    { agentId: 'c', agentName: 'Billing Bot', projectId: 'billing', projectName: 'Billing' }
  ]

  it('sums the loss per project, most agents first', () => {
    const { projects, agentCount } = lossesByProject(lost)
    expect(agentCount).toBe(3)
    expect(projects.map(p => [p.name, p.agents.length])).toEqual([['Website', 2], ['Billing', 1], ['Infra', 1]])
    expect(projects[0]!.agents.map(a => a.name)).toEqual(['Flaky Test Hunter', 'Log Reader'])
  })

  it('says it in one phrase for the picker', () => {
    expect(lossLabel([])).toBe('keeps all projects')
    expect(lossLabel(lost)).toBe('3 leave 3 projects')
    expect(lossLabel(lost.slice(0, 2))).toBe('2 leave 1 project')
  })
})

describe('my agents\' work', () => {
  it('puts open work first, then by status and agent', () => {
    const card = (id: number, status: string, agentName: string, done = false) => ({
      id,
      statusId: done ? 'done' : status,
      status: { name: status },
      assignee: { name: agentName },
      project: { doneStatusId: 'done' }
    })
    const sorted = sortAgentWork([
      card(1, 'Done', 'Claude', true),
      card(2, 'Todo', 'Scout'),
      card(3, 'In Progress', 'Scout'),
      card(4, 'In Progress', 'Bug Triage')
    ])
    expect(sorted.map(c => c.id)).toEqual([4, 3, 2, 1])
  })
})
