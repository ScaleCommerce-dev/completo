/**
 * People and agents in lists: how pickers group them, how the Agents page groups
 * them by manager, and how a hand-over or transfer says what it costs.
 *
 * Pure on purpose, so `tests/unit/people.test.ts` can pin the rules without
 * mounting anything. The components only decide how a group looks.
 */

interface ManagerRef {
  id: string
  name: string
  avatarUrl: string | null
}

export interface PickablePerson {
  id: string
  name: string
  kind?: 'human' | 'agent'
  managedBy?: ManagerRef | null
  description?: string | null
  suspended?: boolean
  lastSeenAt?: string | Date | null
}

export function isAgent(p: { kind?: string } | null | undefined): boolean {
  return p?.kind === 'agent'
}

/** `3 agents`, `1 agent`. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * How many "other agents" a picker lists before asking for a search. People are
 * never capped and neither are your own agents: they are the ones you assign to.
 * Everyone else's agents are the long tail, so only the most recently active few
 * show until a query asks for the rest.
 */
export const OTHER_AGENTS_SHOWN = 3

export interface PickerGroups<T> {
  people: T[]
  mine: T[]
  others: T[]
  /** Other agents matching the query, shown or not. */
  othersTotal: number
  /** Other agents left out until a search asks for them. */
  othersHidden: number
  /**
   * Whether any agent is listable at all, before the query: an active one, or a
   * suspended one kept as the current value. Without one a picker is a single
   * plain list; with one it groups, so a kept agent always has a group to be in
   * and typing a search never switches between the two.
   */
  hasAgents: boolean
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

function seenAt(p: PickablePerson): number {
  return p.lastSeenAt ? new Date(p.lastSeenAt).getTime() : Number.NEGATIVE_INFINITY
}

/** Most recently active first; never-active last, by name among themselves. */
export function byRecency(a: PickablePerson, b: PickablePerson): number {
  return seenAt(b) - seenAt(a) || byName(a, b)
}

function matches(p: PickablePerson, q: string): boolean {
  if (!q) return true
  if (p.name.toLowerCase().includes(q)) return true
  return isAgent(p) && !!p.description?.toLowerCase().includes(q)
}

/**
 * Split project members into the three groups every person picker shows:
 * People, Your agents, Other agents.
 *
 * - A suspended agent is left out: nothing it is handed can be done. `keepIds`
 *   brings one back where it is the current value, so a menu still shows what
 *   is selected.
 * - With no query, Other agents is the `limit` most recently active plus anything
 *   kept; with one, every match in every group.
 */
export function groupForPicker<T extends PickablePerson>(
  members: readonly T[],
  opts: { currentUserId?: string | null, query?: string, keepIds?: Iterable<string>, limit?: number } = {}
): PickerGroups<T> {
  const q = (opts.query ?? '').trim().toLowerCase()
  const keep = new Set(opts.keepIds ?? [])
  const limit = opts.limit ?? OTHER_AGENTS_SHOWN

  const visible = members.filter(m => !(isAgent(m) && m.suspended) || keep.has(m.id))
  const hasAgents = visible.some(isAgent)
  const hit = visible.filter(m => matches(m, q))

  const people = hit.filter(m => !isAgent(m)).sort(byName)
  const mine = hit.filter(m => isAgent(m) && !!opts.currentUserId && m.managedBy?.id === opts.currentUserId).sort(byName)
  const all = hit.filter(m => isAgent(m) && !mine.includes(m))

  if (q) {
    return { people, mine, others: all.sort(byName), othersTotal: all.length, othersHidden: 0, hasAgents }
  }

  const recent = [...all].sort(byRecency)
  const shown = recent.slice(0, limit)
  for (const m of recent.slice(limit)) if (keep.has(m.id)) shown.push(m)

  return { people, mine, others: shown, othersTotal: all.length, othersHidden: all.length - shown.length, hasAgents }
}

// ─── The Agents page ─────────────────────────────────────────────────────────

export interface ListedAgent extends PickablePerson {
  tokenCount?: number
}

export interface ManagerGroup<T> {
  /** `none` for agents with no manager, else the manager's id. */
  key: string
  manager: ManagerRef | null
  isYou: boolean
  agents: T[]
  suspended: number
  withoutToken: number
}

/**
 * The Agents page grouped by manager: *No manager* first, because every agent in
 * it needs an admin to act; then the viewer's own; then everyone else A to Z.
 * Agents inside a group by name.
 */
export function groupByManager<T extends ListedAgent>(agents: readonly T[], currentUserId?: string | null): ManagerGroup<T>[] {
  const groups = new Map<string, ManagerGroup<T>>()
  for (const agent of agents) {
    const key = agent.managedBy?.id ?? 'none'
    let group = groups.get(key)
    if (!group) {
      group = {
        key,
        manager: agent.managedBy ?? null,
        isYou: !!currentUserId && key === currentUserId,
        agents: [],
        suspended: 0,
        withoutToken: 0
      }
      groups.set(key, group)
    }
    group.agents.push(agent)
    if (agent.suspended) group.suspended++
    else if (!agent.tokenCount) group.withoutToken++
  }

  const rank = (g: ManagerGroup<T>) => (g.key === 'none' ? 0 : g.isYou ? 1 : 2)
  return [...groups.values()]
    .map(g => ({ ...g, agents: [...g.agents].sort(byName) }))
    .sort((a, b) => rank(a) - rank(b) || (a.manager?.name ?? '').localeCompare(b.manager?.name ?? ''))
}

export type AgentStatusFilter = 'active' | 'suspended' | 'no-token'

/** The Agents page's search and filters, applied to what the server returned. */
export function filterAgents<T extends ListedAgent>(
  agents: readonly T[],
  opts: { query?: string, managerId?: string | null, status?: AgentStatusFilter | null }
): T[] {
  const q = (opts.query ?? '').trim().toLowerCase()
  return agents.filter((a) => {
    if (!matches(a, q)) return false
    if (opts.managerId === 'none' && a.managedBy) return false
    if (opts.managerId && opts.managerId !== 'none' && a.managedBy?.id !== opts.managerId) return false
    if (opts.status === 'active' && a.suspended) return false
    if (opts.status === 'suspended' && !a.suspended) return false
    if (opts.status === 'no-token' && (a.suspended || a.tokenCount)) return false
    return true
  })
}

/** "24 agents", "1 agent", or "None": the Admin › Users count. */
export function agentCountLabel(n: number): string {
  return n ? plural(n, 'agent') : 'None'
}

/** "Scout, Bug Triage, Scout EU and 2 more". */
export function summarizeNames(names: readonly string[], max = 3): string {
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`
}

// ─── What a transfer costs ───────────────────────────────────────────────────

export interface LostMembership {
  agentId: string
  agentName: string
  projectId: string
  projectName: string
}

export interface ProjectLoss {
  id: string
  name: string
  agents: Array<{ id: string, name: string }>
}

/**
 * The memberships a transfer removes, summed per project rather than repeated
 * per agent: "9 agents leave 2 projects", then one line per project. Projects
 * losing the most agents first.
 */
export function lossesByProject(lost: readonly LostMembership[]): { projects: ProjectLoss[], agentCount: number } {
  const projects = new Map<string, ProjectLoss>()
  for (const m of lost) {
    const p = projects.get(m.projectId) ?? { id: m.projectId, name: m.projectName, agents: [] }
    if (!p.agents.some(a => a.id === m.agentId)) p.agents.push({ id: m.agentId, name: m.agentName })
    projects.set(m.projectId, p)
  }
  return {
    projects: [...projects.values()]
      .map(p => ({ ...p, agents: [...p.agents].sort(byName) }))
      .sort((a, b) => b.agents.length - a.agents.length || a.name.localeCompare(b.name)),
    agentCount: new Set(lost.map(m => m.agentId)).size
  }
}

/** The cost of one candidate, as the new-manager picker shows it beside the name. */
export function lossLabel(lost: readonly LostMembership[]): string {
  if (!lost.length) return 'keeps all projects'
  const { projects, agentCount } = lossesByProject(lost)
  return `${agentCount} leave ${plural(projects.length, 'project')}`
}

// ─── My agents' work ─────────────────────────────────────────────────────────

export interface AgentWorkCard {
  id: number
  status: { name: string } | null
  statusId: string
  assignee: { name: string } | null
  project: { doneStatusId: string | null }
}

/**
 * Open work first and done last, then by status and by agent, so the rows for one
 * status sit together and each agent's cards sit together inside it.
 */
export function sortAgentWork<T extends AgentWorkCard>(cards: readonly T[]): T[] {
  const done = (c: T) => (c.project.doneStatusId && c.statusId === c.project.doneStatusId ? 1 : 0)
  return [...cards].sort((a, b) =>
    done(a) - done(b)
    || (a.status?.name ?? '').localeCompare(b.status?.name ?? '')
    || (a.assignee?.name ?? '').localeCompare(b.assignee?.name ?? '')
    || a.id - b.id)
}
