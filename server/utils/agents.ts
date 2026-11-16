import { eq, and, ne, or, inArray, isNull, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Agents: accounts for AI tools.
 *
 * An agent is a `users` row with `kind = 'agent'`, so everything that already
 * takes a user (assignee, comment author, card creator, notification actor,
 * project member) takes an agent with no second code path, and its API tokens
 * are ordinary `api_tokens` rows that `resolveAuth` reads like anyone else's.
 * What makes it an agent is the set of things it can never do, each refused by
 * an explicit `kind` check rather than by its unusable credentials:
 *
 * - sign in: the hash is the unhashable '!agent', and every login, reset,
 *   setup, verification and OAuth path also refuses the row by kind;
 * - be admin or project owner, create projects, manage members;
 * - receive email or in-app notifications. Its address is synthetic
 *   (`@agents.invalid`, a reserved TLD) and is never returned where a person's
 *   address would be.
 *
 * And one invariant on membership: an agent may only be a member of projects
 * its manager is a member of (an admin manager: any project). Without it a
 * project owner could add Bob's agent to a project Bob is not in, and Bob would
 * read that project through the agent's token. Every path that changes either
 * side keeps it: adding an agent, removing its manager from a project, a
 * transfer, an admin manager losing admin, and a manager or an agent being able
 * to act again (the permission granted back, an agent unsuspended).
 */

export const AGENT_PASSWORD_HASH = '!agent'
export const AGENT_EMAIL_DOMAIN = 'agents.invalid'

/**
 * The synthetic address for a new agent: a slug of its name and a short random
 * suffix, on a reserved TLD that no mail server will ever accept.
 */
export function agentEmail(name: string, suffix: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return `${slug || 'agent'}-${suffix}@${AGENT_EMAIL_DOMAIN}`
}

interface ManagerState {
  kind: string
  isAdmin: number | boolean
  canCreateAgents: number | boolean
  suspendedAt: Date | null
}

/**
 * Whether a person may create and manage agents, and so may receive them in a
 * transfer: a human who is not suspended and is either an admin or allowed by one.
 */
export function canManageAgents(user: ManagerState): boolean {
  return user.kind === 'human' && !user.suspendedAt && (!!user.isAdmin || !!user.canCreateAgents)
}

/**
 * The membership invariant as a pure rule. An agent with no manager may join
 * nothing; an admin's agents may join any project; anyone else's only the
 * projects that person is a member of.
 */
export function agentMayJoinProject(manager: { kind: string, isAdmin: number | boolean } | null, managerIsMember: boolean): boolean {
  if (!manager || manager.kind !== 'human') return false
  return !!manager.isAdmin || managerIsMember
}

/**
 * The projects an agent leaves when it is handed to `manager`: every project of
 * the agent's that the new manager is not in, and none for an admin.
 */
export function projectsLostOnTransfer(agentProjectIds: string[], manager: { isAdmin: number | boolean, projectIds: ReadonlySet<string> }): string[] {
  if (manager.isAdmin) return []
  return agentProjectIds.filter(id => !manager.projectIds.has(id))
}

// âââ Lookups âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

export function loadUserRow(id: string) {
  return db.select().from(schema.users).where(eq(schema.users.id, id)).get()
}

function loadAgentRow(id: string) {
  return db.select().from(schema.users)
    .where(and(eq(schema.users.id, id), eq(schema.users.kind, 'agent')))
    .get()
}

/** Project ids a user is a member of. */
export function memberProjectIds(userId: string): Set<string> {
  return new Set(db.select({ projectId: schema.projectMembers.projectId })
    .from(schema.projectMembers)
    .where(eq(schema.projectMembers.userId, userId))
    .all()
    .map(r => r.projectId))
}

export function isProjectMember(projectId: string, userId: string): boolean {
  return !!db.select({ id: schema.projectMembers.id }).from(schema.projectMembers)
    .where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, userId)))
    .get()
}

/** The agents a person manages that are not suspended. */
export function activeAgentsOf(userId: string) {
  return db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(and(
      eq(schema.users.kind, 'agent'),
      eq(schema.users.managedById, userId),
      isNull(schema.users.suspendedAt)
    ))
    .all()
}

/** Every agent a person manages, suspended or not. */
export function agentsOf(userId: string) {
  return db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(and(eq(schema.users.kind, 'agent'), eq(schema.users.managedById, userId)))
    .all()
}

/**
 * Refuse a change that would leave a person's active agents with a manager who
 * can no longer manage them (deleted, suspended, demoted without the permission,
 * or the permission revoked). The agents have to be transferred or suspended
 * first, through the hand-over endpoint; `data.agentCount` lets the client say
 * how many.
 */
export function assertNoActiveAgents(user: { id: string, name: string }) {
  const count = activeAgentsOf(user.id).length
  if (count > 0) {
    throw createError({
      statusCode: 409,
      message: `${user.name} still manages ${count} active ${count === 1 ? 'agent' : 'agents'}. Transfer or suspend ${count === 1 ? 'it' : 'them'} first.`,
      data: { agentCount: count }
    })
  }
}

/** Name or description contains `q`, literally (`likeContains`). */
export function agentSearchCondition(q: string) {
  return or(likeContains(schema.users.name, q), likeContains(schema.users.description, q))!
}

// âââ Guards ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/** The caller may create agents: an admin, or a person an admin allowed. */
export async function requireAgentCreator(event: H3Event) {
  const { user } = await resolveAuth(event)
  const row = loadUserRow(user.id)
  if (!row || !canManageAgents(row)) {
    throw createError({ statusCode: 403, message: 'You are not allowed to create agents' })
  }
  return { user, row }
}

/**
 * An agent the caller may manage: its manager, or any admin. Anyone else gets a
 * 404, the same answer as for an id that does not exist, so agent ids cannot be
 * probed by people with no business knowing them.
 */
export async function resolveManagedAgent(event: H3Event) {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')!
  const agent = loadAgentRow(id)
  if (!agent || (!user.isAdmin && agent.managedById !== user.id)) {
    throw createError({ statusCode: 404, message: 'Agent not found' })
  }
  return { user, agent }
}

/**
 * Refuse a name another agent already has, with a 409. The shape of an agent's
 * fields is `shared/schemas/agent.ts`; this is the part that needs the database.
 * The unique index on `lower(name)` is the backstop for two creates racing past it.
 */
export function assertAgentNameFree(name: string, exceptId?: string) {
  const clash = db.select({ id: schema.users.id }).from(schema.users)
    .where(and(
      eq(schema.users.kind, 'agent'),
      sql`lower(${schema.users.name}) = lower(${name})`
    ))
    .all()
    .some(r => r.id !== exceptId)
  if (clash) {
    throw createError({ statusCode: 409, message: `An agent called "${name}" already exists` })
  }
}

// âââ Changes âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

/**
 * Suspend agents and revoke every credential they hold. Revoking rather than
 * pausing means a leaked token stays dead: unsuspending needs a new token.
 * Returns the number of API tokens revoked.
 */
export function suspendAgents(agentIds: string[]): number {
  if (!agentIds.length) return 0
  return db.transaction(() => {
    // Only agents: a person's id slipping in here must not cost them their tokens.
    const ids = db.select({ id: schema.users.id }).from(schema.users)
      .where(and(inArray(schema.users.id, agentIds), eq(schema.users.kind, 'agent')))
      .all()
      .map(r => r.id)
    if (!ids.length) return 0
    db.update(schema.users)
      .set({ suspendedAt: new Date() })
      .where(and(inArray(schema.users.id, ids), isNull(schema.users.suspendedAt)))
      .run()
    return revokeAgentCredentials(ids)
  })
}

/**
 * Delete every credential the given agents hold, returning how many API tokens
 * went. Call inside the caller's transaction. Shared by suspension and transfer:
 * a token is held by whoever minted it, so a credential that outlives a change of
 * hands keeps acting for the previous holder.
 */
function revokeAgentCredentials(ids: string[]): number {
  if (!ids.length) return 0
  const revoked = db.delete(schema.apiTokens)
    .where(inArray(schema.apiTokens.userId, ids))
    .returning({ id: schema.apiTokens.id })
    .all()
    .length
  // An agent has no session and so cannot complete an OAuth consent, but its
  // credentials are whatever rows name it: clear these too rather than rely on that.
  db.delete(schema.oauthGrants).where(inArray(schema.oauthGrants.userId, ids)).run()
  return revoked
}

/**
 * Take one member, person or agent, out of one project. Their cards there are
 * unassigned: someone who can no longer open a project cannot work on them, so
 * leaving their name on them would hide that nobody is — and for a person it
 * also kept them on the card's notification list after they left. Each card's
 * history says so, against `actor`: whoever's request took the member out,
 * directly or, for an agent, by removing its manager.
 */
export function removeFromProject(memberId: string, projectId: string, actor: HistoryActor): number {
  const unassigned = db.transaction(() => {
    db.delete(schema.projectMembers)
      .where(and(eq(schema.projectMembers.projectId, projectId), eq(schema.projectMembers.userId, memberId)))
      .run()
    const cards = db.update(schema.cards)
      .set({ assigneeId: null, updatedAt: new Date() })
      .where(and(eq(schema.cards.projectId, projectId), eq(schema.cards.assigneeId, memberId)))
      .returning({ id: schema.cards.id })
      .all()
    const member = userSide(memberId)
    recordCardEvents(actor, cards.map(c => ({ cardId: c.id, field: 'assignee' as const, from: member, to: null })))
    return cards.length
  })
  if (unassigned) emitViewChange(projectId)
  return unassigned
}

/**
 * A person left a project, so the agents they manage leave it too. Returns the
 * agents removed and how many of their cards were unassigned.
 */
export function removeManagedAgentsFromProject(managerId: string, projectId: string, actor: HistoryActor) {
  const agents = db.select({ id: schema.users.id, name: schema.users.name })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(and(
      eq(schema.projectMembers.projectId, projectId),
      eq(schema.users.kind, 'agent'),
      eq(schema.users.managedById, managerId)
    ))
    .all()
  let unassignedCards = 0
  for (const agent of agents) unassignedCards += removeFromProject(agent.id, projectId, actor)
  return { agents, unassignedCards }
}

export interface LostMembership {
  agentId: string
  agentName: string
  projectId: string
  projectName: string
}

/**
 * What handing `agentIds` to `manager` costs: one entry per project an agent
 * would leave. Read-only; `pruneAgentMemberships` applies the same plan.
 */
export function planAgentMemberships(agentIds: string[], manager: { id: string, isAdmin: number | boolean }): LostMembership[] {
  if (!agentIds.length || manager.isAdmin) return []
  const managerProjects = memberProjectIds(manager.id)
  const rows = db.select({
    agentId: schema.projectMembers.userId,
    agentName: schema.users.name,
    projectId: schema.projects.id,
    projectName: schema.projects.name
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.id))
    .where(inArray(schema.projectMembers.userId, agentIds))
    .all()
  const lost: LostMembership[] = []
  for (const agentId of agentIds) {
    const own = rows.filter(r => r.agentId === agentId)
    const leaving = new Set(projectsLostOnTransfer(own.map(r => r.projectId), { isAdmin: manager.isAdmin, projectIds: managerProjects }))
    for (const r of own) if (leaving.has(r.projectId)) lost.push(r)
  }
  return lost
}

/** Remove agents from every project `manager` is not in, keeping the invariant. */
export function pruneAgentMemberships(agentIds: string[], manager: { id: string, isAdmin: number | boolean }, actor: HistoryActor): LostMembership[] {
  const lost = planAgentMemberships(agentIds, manager)
  for (const m of lost) removeFromProject(m.agentId, m.projectId, actor)
  return lost
}

/**
 * Hand agents to a new manager. The caller has checked that the caller is an
 * admin and that every id is an agent; this checks the recipient. A suspended
 * agent stays suspended, for its new manager to wake.
 *
 * Every agent that changes hands loses its tokens and grants. The previous
 * manager minted them and still holds them, so they kept working after a
 * hand-over: a person handed over and then deleted kept acting through the
 * agent, and once the new manager added it to one of their projects, the old one
 * could read that project too, which is what the membership rule exists to stop.
 * The new manager mints fresh tokens. An agent already managed by the recipient
 * keeps its own.
 */
export function transferAgents(agentIds: string[], toUserId: string, actor: HistoryActor, opts: { dryRun?: boolean } = {}) {
  const manager = loadUserRow(toUserId)
  if (!manager || !canManageAgents(manager)) {
    throw createError({ statusCode: 400, message: 'The new manager must be an active admin or a person allowed to create agents' })
  }
  const changingHands = agentIds.length
    ? db.select({ id: schema.users.id }).from(schema.users)
        .where(and(
          inArray(schema.users.id, agentIds),
          eq(schema.users.kind, 'agent'),
          or(isNull(schema.users.managedById), ne(schema.users.managedById, manager.id))
        ))
        .all()
        .map(r => r.id)
    : []
  if (opts.dryRun || !agentIds.length) {
    const tokensToRevoke = changingHands.length
      ? db.select({ id: schema.apiTokens.id }).from(schema.apiTokens)
        .where(inArray(schema.apiTokens.userId, changingHands)).all().length
      : 0
    return { manager, removedFrom: planAgentMemberships(agentIds, manager), revokedTokens: tokensToRevoke }
  }
  // One transaction: a failure between the hand-over and the pruning would leave
  // agents in projects their new manager is not in, which is the invariant, and a
  // failure before the revocation would leave the old manager's tokens alive.
  return db.transaction(() => {
    db.update(schema.users)
      .set({ managedById: manager.id })
      .where(and(inArray(schema.users.id, agentIds), eq(schema.users.kind, 'agent')))
      .run()
    const revokedTokens = revokeAgentCredentials(changingHands)
    return { manager, removedFrom: pruneAgentMemberships(agentIds, manager, actor), revokedTokens }
  })
}

/**
 * Load agents by id for a bulk action, 404 if any id is not an agent. The list's
 * shape is checked where it arrives (`shared/schemas/agent.ts`).
 */
export function loadAgentsForBulk(agentIds: readonly string[]) {
  const ids = [...new Set(agentIds)]
  const agents = db.select().from(schema.users)
    .where(and(inArray(schema.users.id, ids), eq(schema.users.kind, 'agent')))
    .all()
  if (agents.length !== ids.length) {
    throw createError({ statusCode: 404, message: 'Agent not found' })
  }
  return agents
}

// âââ Response shapes âââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

type AgentRow = typeof schema.users.$inferSelect

/**
 * Agents as the Agents page lists them, with what each row shows: manager,
 * projects, token count and last activity. Batched: three queries for any
 * number of agents. Never the synthetic address; the detail adds that.
 */
export function describeAgents(agents: AgentRow[]) {
  if (!agents.length) return []
  const ids = agents.map(a => a.id)
  const { ref } = createUserRefs(agents)

  const projectRows = db.select({
    userId: schema.projectMembers.userId,
    id: schema.projects.id,
    name: schema.projects.name,
    slug: schema.projects.slug,
    key: schema.projects.key,
    icon: schema.projects.icon,
    role: schema.projectMembers.role
  })
    .from(schema.projectMembers)
    .innerJoin(schema.projects, eq(schema.projectMembers.projectId, schema.projects.id))
    .where(inArray(schema.projectMembers.userId, ids))
    .all()

  const tokenCounts = new Map(db.select({ userId: schema.apiTokens.userId, count: sql<number>`count(*)` })
    .from(schema.apiTokens)
    .where(inArray(schema.apiTokens.userId, ids))
    .groupBy(schema.apiTokens.userId)
    .all()
    .map(r => [r.userId, r.count]))

  return agents.map((agent) => {
    const projects = projectRows
      .filter(p => p.userId === agent.id)
      .map(({ userId: _userId, ...p }) => p)
      .sort((a, b) => a.name.localeCompare(b.name))
    return {
      ...ref(agent),
      description: agent.description,
      suspended: !!agent.suspendedAt,
      suspendedAt: agent.suspendedAt,
      lastSeenAt: agent.lastSeenAt,
      createdAt: agent.createdAt,
      projectCount: projects.length,
      projects,
      tokenCount: tokenCounts.get(agent.id) ?? 0
    }
  })
}

/**
 * One agent for its own page: the list shape plus its address (for the CLI's
 * COMPLETO_USER), its project roles, its tokens (never the hash) and how many
 * cards it holds. Only its manager and admins reach this.
 */
export function describeAgent(agent: AgentRow) {
  const [summary] = describeAgents([agent])
  const tokens = db.select().from(schema.apiTokens)
    .where(eq(schema.apiTokens.userId, agent.id))
    .all()
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(t => ({
      id: t.id,
      name: t.name,
      tokenPrefix: t.tokenPrefix,
      expiresAt: t.expiresAt,
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
      isExpired: t.expiresAt ? t.expiresAt < new Date() : false
    }))
  const assignedCardCount = db.select({ count: sql<number>`count(*)` })
    .from(schema.cards)
    .where(eq(schema.cards.assigneeId, agent.id))
    .get()?.count ?? 0
  return {
    ...summary!,
    email: agent.email,
    tokens,
    assignedCardCount
  }
}
