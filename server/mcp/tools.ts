/**
 * The MCP tool set: what Claude can do to a board without the CLI.
 *
 * Every tool is a thin wrapper around the public REST API, called in-process
 * through `event.$fetch` with the caller's own Authorization header, so
 * membership, validation, notifications and live board updates are the
 * handlers' and are not repeated here. What this layer adds is what a language
 * model needs and a URL does not offer: names instead of ids (a status, tag or
 * assignee by name, a card by its ticket id, a project by slug or key), one
 * call where the API needs three (tagging a card creates the tag it lacks),
 * and a compact card shape with no avatar URLs, colours or picker lists.
 *
 * Name matches are exact first, then case-insensitive when that is unambiguous.
 * A miss lists what exists, so the model can correct itself in one turn rather
 * than guess again.
 */
import type { H3Event } from 'h3'

export type JsonObject = Record<string, unknown>

export interface ToolDefinition {
  name: string
  description: string
  inputSchema: JsonObject
  annotations?: {
    readOnlyHint?: boolean
    destructiveHint?: boolean
    idempotentHint?: boolean
  }
}

/** A failure the model can act on: surfaced as an `isError` result, never as a protocol error. */
export class ToolError extends Error {}

export interface ToolContext {
  get<T>(path: string, query?: JsonObject): Promise<T>
  send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T>
  /** Scheme and host the caller reached us on, for card links. */
  origin: string
  userId: string
}

type Priority = 'low' | 'medium' | 'high' | 'urgent'

interface ApiStatus { id: string, name: string, color: string | null, cardCount?: number }
interface ApiTag { id: string, name: string, color: string }
interface ApiMember { id: string, name: string, email?: string, role?: string }
interface ApiProjectRef { id: string, name: string, slug: string, key: string }
interface ApiProject extends ApiProjectRef {
  description: string | null
  doneStatusId: string | null
  doneRetentionDays: number | null
  role: string
  statuses: ApiStatus[]
  tags: ApiTag[]
  boards: Array<{ id: string, name: string, slug: string }>
  lists: Array<{ id: string, name: string, slug: string }>
  totalCards: number
  openCards: number
}
interface ApiProjectSummary extends ApiProjectRef {
  description: string | null
  role: string
  openCards: number
  totalCards: number
  memberCount: number
  lastActivity: string | null
}
interface ApiCard {
  id: number
  projectId: string
  statusId: string
  title: string
  description: string | null
  priority: Priority | null
  position: number
  dueDate: string | null
  assigneeId: string | null
  createdAt: string
  updatedAt: string
  assignee: { id: string, name: string } | null
  status?: { id: string, name: string } | null
  tags?: ApiTag[]
  commentCount?: number
  attachmentCount?: number
}
/** `GET /api/cards/:id` carries the project's pickers alongside the card. */
interface ApiCardDetail extends ApiCard {
  project: ApiProjectRef | null
  statuses: ApiStatus[]
  members: ApiMember[]
  projectTags: ApiTag[]
}
interface ApiComment { id: string, body: string, authorName: string | null, createdAt: string, updatedAt: string | null }
interface ApiSearchHit {
  id: number
  title: string
  priority: Priority | null
  dueDate: string | null
  projectSlug: string
  projectKey: string
  projectName: string
  statusName: string | null
  isDone: number
  assigneeName: string | null
}
interface ApiMyTasks {
  groups: Array<{ project: ApiProjectRef, statuses: ApiStatus[], cards: ApiCard[] }>
}

const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent']

/** The move handler's upper bound; anything at or past the end lands last. */
const POSITION_END = 10000

// ─── Lookups ─────────────────────────────────────────────────────────────────

function str(args: JsonObject, key: string): string | undefined {
  const v = args[key]
  if (v === undefined || v === null || v === '') return undefined
  if (typeof v !== 'string') throw new ToolError(`"${key}" must be a string`)
  return v
}

function need(args: JsonObject, key: string): string {
  const v = str(args, key)
  if (v === undefined) throw new ToolError(`"${key}" is required`)
  return v
}

function byName<T extends { id: string, name: string }>(kind: string, items: T[], wanted: string): T {
  const w = wanted.trim()
  const exact = items.find(i => i.id === w || i.name === w)
  if (exact) return exact
  const loose = items.filter(i => i.name.toLowerCase() === w.toLowerCase())
  if (loose.length === 1) return loose[0]!
  const names = items.map(i => `"${i.name}"`).join(', ')
  throw new ToolError(loose.length
    ? `"${wanted}" matches more than one ${kind} by case: ${names}`
    : `Unknown ${kind} "${wanted}". Available: ${names || 'none'}`)
}

/** "TK-42", "tk-42", "42" and 42 all name card 42. */
function cardNumber(ref: unknown): number {
  const s = String(ref ?? '').trim()
  const n = Number(s.includes('-') ? s.slice(s.lastIndexOf('-') + 1) : s)
  if (!s || !Number.isInteger(n) || n <= 0) throw new ToolError(`"${s}" is not a card id. Use the ticket id (e.g. TK-42) or the number.`)
  return n
}

async function loadProject(ctx: ToolContext, ref: string): Promise<ApiProject> {
  try {
    return await ctx.get<ApiProject>(`/api/projects/${encodeURIComponent(ref)}`)
  } catch (direct) {
    // Not a slug or id: try the project key ("TK") or the name.
    const all = await ctx.get<ApiProjectSummary[]>('/api/projects')
    const w = ref.trim().toLowerCase()
    const hit = all.find(p => p.key.toLowerCase() === w) ?? all.find(p => p.name.toLowerCase() === w)
    if (!hit) {
      const names = all.map(p => `${p.slug} (${p.key})`).join(', ')
      throw new ToolError(`${(direct as Error).message}. Your projects: ${names || 'none'}`)
    }
    return ctx.get<ApiProject>(`/api/projects/${encodeURIComponent(hit.id)}`)
  }
}

async function loadCard(ctx: ToolContext, ref: unknown): Promise<ApiCardDetail> {
  return ctx.get<ApiCardDetail>(`/api/cards/${cardNumber(ref)}`)
}

function cardUrl(ctx: ToolContext, slug: string, ticket: string) {
  return `${ctx.origin}/projects/${slug}/cards/${ticket}`
}

function cardView(ctx: ToolContext, card: ApiCard, project: ApiProjectRef, statuses?: ApiStatus[]) {
  const ticket = `${project.key}-${card.id}`
  return {
    ticket,
    title: card.title,
    status: card.status?.name ?? statuses?.find(s => s.id === card.statusId)?.name ?? null,
    priority: card.priority ?? 'medium',
    assignee: card.assignee?.name ?? null,
    dueDate: card.dueDate ? card.dueDate.slice(0, 10) : null,
    tags: (card.tags ?? []).map(t => t.name),
    ...(card.commentCount !== undefined ? { comments: card.commentCount } : {}),
    description: card.description ?? '',
    project: project.slug,
    url: cardUrl(ctx, project.slug, ticket),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt
  }
}

function projectOf(card: ApiCardDetail): ApiProjectRef {
  if (!card.project) throw new ToolError('Card has no project')
  return card.project
}

async function resolveAssignee(ctx: ToolContext, members: ApiMember[], wanted: string): Promise<string> {
  const w = wanted.trim()
  if (w.toLowerCase() === 'me') return ctx.userId
  const byEmail = members.find(m => m.email && m.email.toLowerCase() === w.toLowerCase())
  if (byEmail) return byEmail.id
  return byName('member', members, w).id
}

function priorityArg(args: JsonObject): Priority | undefined {
  const p = str(args, 'priority')
  if (p === undefined) return undefined
  const v = p.toLowerCase() as Priority
  if (!PRIORITIES.includes(v)) throw new ToolError(`Priority must be one of ${PRIORITIES.join(', ')}`)
  return v
}

// ─── Schema helpers ──────────────────────────────────────────────────────────

const CARD_REF = { type: 'string', description: 'Ticket id such as TK-42, or the bare card number.' }
const PROJECT_REF = { type: 'string', description: 'Project slug, key (e.g. TK), id or name.' }
const PRIORITY = { type: 'string', enum: PRIORITIES }
const DUE_DATE = { type: 'string', description: 'YYYY-MM-DD. Pass an empty string to clear.' }

function schema(properties: JsonObject, required: string[] = []): JsonObject {
  return { type: 'object', properties, required, additionalProperties: false }
}

// ─── The tools ───────────────────────────────────────────────────────────────

interface Tool extends ToolDefinition {
  run: (ctx: ToolContext, args: JsonObject) => Promise<unknown>
}

const TOOLS: Tool[] = [
  {
    name: 'list_projects',
    description: 'Projects the caller belongs to, with key, slug, role and open card count. Start here when a project is referred to by a name you have not resolved yet.',
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
    run: async (ctx) => {
      const all = await ctx.get<ApiProjectSummary[]>('/api/projects')
      return all.map(p => ({
        name: p.name,
        key: p.key,
        slug: p.slug,
        role: p.role,
        description: p.description ?? '',
        openCards: p.openCards,
        totalCards: p.totalCards,
        members: p.memberCount,
        lastActivity: p.lastActivity
      }))
    }
  },
  {
    name: 'get_project',
    description: 'A project with its statuses (the workflow, in order), tags, members, boards and lists. Statuses and tags are per project; read them before moving or tagging if you are unsure of a name.',
    inputSchema: schema({ project: PROJECT_REF }, ['project']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const project = await loadProject(ctx, need(args, 'project'))
      const members = await ctx.get<ApiMember[]>(`/api/projects/${project.id}/members`)
      return {
        name: project.name,
        key: project.key,
        slug: project.slug,
        description: project.description ?? '',
        role: project.role,
        statuses: project.statuses.map(s => ({ name: s.name, cards: s.cardCount ?? 0, done: s.id === project.doneStatusId })),
        doneRetentionDays: project.doneRetentionDays,
        tags: project.tags.map(t => t.name),
        members: members.map(m => ({ name: m.name, role: m.role })),
        boards: project.boards.map(b => b.name),
        lists: project.lists.map(l => l.name),
        openCards: project.openCards,
        totalCards: project.totalCards,
        url: `${ctx.origin}/projects/${project.slug}`
      }
    }
  },
  {
    name: 'list_cards',
    description: 'Cards in a project, filtered by status, assignee, priority, tag or due date. Sorted by board position by default, so the first card of a status is the top of its column. Done cards older than the project\'s retention window are left out unless includeDone is set.',
    inputSchema: schema({
      project: PROJECT_REF,
      status: { type: 'string', description: 'Status name, e.g. "To Do".' },
      assignee: { type: 'string', description: '"me", a member name or email.' },
      priority: { type: 'string', description: 'One or more of low, medium, high, urgent, comma-separated.' },
      tag: { type: 'string', description: 'Tag name.' },
      dueBefore: { type: 'string', description: 'YYYY-MM-DD, inclusive.' },
      dueAfter: { type: 'string', description: 'YYYY-MM-DD, inclusive.' },
      includeDone: { type: 'boolean' },
      sort: { type: 'string', enum: ['position', 'priority', 'dueDate', 'createdAt', 'updatedAt', 'title'] },
      order: { type: 'string', enum: ['asc', 'desc'] },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 50.' }
    }, ['project']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const project = await loadProject(ctx, need(args, 'project'))
      const query: JsonObject = {}
      const status = str(args, 'status')
      if (status) query.statusId = byName('status', project.statuses, status).id
      const tag = str(args, 'tag')
      if (tag) query.tagId = byName('tag', project.tags, tag).id
      const assignee = str(args, 'assignee')
      if (assignee) {
        const members = await ctx.get<ApiMember[]>(`/api/projects/${project.id}/members`)
        query.assigneeId = await resolveAssignee(ctx, members, assignee)
      }
      for (const key of ['priority', 'dueBefore', 'dueAfter', 'sort', 'order'] as const) {
        const v = str(args, key)
        if (v) query[key] = v
      }
      if (args.includeDone === true) query.includeDone = 'true'
      if (typeof args.limit === 'number') query.limit = args.limit
      const cards = await ctx.get<ApiCard[]>(`/api/projects/${project.id}/cards`, query)
      return cards.map(c => cardView(ctx, c, project))
    }
  },
  {
    name: 'search_cards',
    description: 'Find cards by words in the title or description, or by ticket id, across every project the caller can see. Ten best matches.',
    inputSchema: schema({
      query: { type: 'string' },
      project: { ...PROJECT_REF, description: 'Optional: only this project.' }
    }, ['query']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const q = need(args, 'query')
      const projectRef = str(args, 'project')
      const only = projectRef ? await loadProject(ctx, projectRef) : null
      const hits = await ctx.get<ApiSearchHit[]>('/api/cards/search', { q })
      return hits
        .filter(h => !only || h.projectSlug === only.slug)
        .map(h => ({
          ticket: `${h.projectKey}-${h.id}`,
          title: h.title,
          status: h.statusName,
          done: !!h.isDone,
          priority: h.priority ?? 'medium',
          assignee: h.assigneeName,
          dueDate: h.dueDate ? h.dueDate.slice(0, 10) : null,
          project: h.projectSlug,
          url: cardUrl(ctx, h.projectSlug, `${h.projectKey}-${h.id}`)
        }))
    }
  },
  {
    name: 'get_card',
    description: 'A card in full: description (Markdown; checklist items are `- [ ]` lines), status, assignee, tags, due date and link.',
    inputSchema: schema({ card: CARD_REF }, ['card']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      return cardView(ctx, card, projectOf(card), card.statuses)
    }
  },
  {
    name: 'create_card',
    description: 'Create a card. Lands at the bottom of its status. Status defaults to the project\'s first status (usually Backlog); name the status when the user said where it goes. Tags that do not exist yet are created.',
    inputSchema: schema({
      project: PROJECT_REF,
      title: { type: 'string' },
      description: { type: 'string', description: 'Markdown. Use `- [ ]` lines for a checklist.' },
      status: { type: 'string', description: 'Status name.' },
      priority: PRIORITY,
      assignee: { type: 'string', description: '"me", a member name or email.' },
      dueDate: DUE_DATE,
      tags: { type: 'array', items: { type: 'string' }, description: 'Tag names.' }
    }, ['project', 'title']),
    run: async (ctx, args) => {
      const project = await loadProject(ctx, need(args, 'project'))
      const statusRef = str(args, 'status')
      const status = statusRef ? byName('status', project.statuses, statusRef) : project.statuses[0]
      if (!status) throw new ToolError('Project has no statuses')
      const body: JsonObject = {
        title: need(args, 'title'),
        statusId: status.id,
        description: str(args, 'description'),
        priority: priorityArg(args),
        dueDate: str(args, 'dueDate')
      }
      const assignee = str(args, 'assignee')
      if (assignee) {
        const members = await ctx.get<ApiMember[]>(`/api/projects/${project.id}/members`)
        body.assigneeId = await resolveAssignee(ctx, members, assignee)
      }
      const created = await ctx.send<ApiCard>('POST', `/api/projects/${project.id}/cards`, body)
      const tags = Array.isArray(args.tags) ? args.tags.map(String).filter(Boolean) : []
      if (tags.length) await applyTags(ctx, project, created.id, [], tags, [])
      const card = await loadCard(ctx, created.id)
      return cardView(ctx, card, project, card.statuses)
    }
  },
  {
    name: 'update_card',
    description: 'Change a card\'s title, description, priority or due date. Only the fields given change. The description is replaced whole: read it first and send the full new text.',
    inputSchema: schema({
      card: CARD_REF,
      title: { type: 'string' },
      description: { type: 'string', description: 'Markdown, replaces the whole description.' },
      priority: PRIORITY,
      dueDate: DUE_DATE
    }, ['card']),
    annotations: { idempotentHint: true },
    run: async (ctx, args) => {
      const existing = await loadCard(ctx, need(args, 'card'))
      const body: JsonObject = {}
      const title = str(args, 'title')
      if (title !== undefined) body.title = title
      if (typeof args.description === 'string') body.description = args.description
      const priority = priorityArg(args)
      if (priority) body.priority = priority
      if (typeof args.dueDate === 'string') body.dueDate = args.dueDate || null
      if (!Object.keys(body).length) throw new ToolError('Nothing to change: give title, description, priority or dueDate')
      await ctx.send('PUT', `/api/cards/${existing.id}`, body)
      const card = await loadCard(ctx, existing.id)
      return cardView(ctx, card, projectOf(card), card.statuses)
    }
  },
  {
    name: 'move_card',
    description: 'Move a card to another status (column), at the bottom unless a position is given. This is how a card walks through the workflow, e.g. "In Progress" then "Review".',
    inputSchema: schema({
      card: CARD_REF,
      status: { type: 'string', description: 'Status name.' },
      position: { type: 'string', description: '"top", "bottom" (default) or a zero-based index.' }
    }, ['card', 'status']),
    annotations: { idempotentHint: true },
    run: async (ctx, args) => {
      const existing = await loadCard(ctx, need(args, 'card'))
      const status = byName('status', existing.statuses, need(args, 'status'))
      const pos = str(args, 'position') ?? 'bottom'
      let position: number
      if (pos === 'top') position = 0
      else if (pos === 'bottom') position = POSITION_END
      else {
        position = Number(pos)
        if (!Number.isInteger(position) || position < 0) throw new ToolError('position must be "top", "bottom" or a non-negative integer')
      }
      await ctx.send('PUT', `/api/cards/${existing.id}/move`, { statusId: status.id, position: Math.min(position, POSITION_END) })
      const card = await loadCard(ctx, existing.id)
      return cardView(ctx, card, projectOf(card), card.statuses)
    }
  },
  {
    name: 'assign_card',
    description: 'Assign a card to a project member ("me", a name or an email), or unassign it with an empty assignee.',
    inputSchema: schema({
      card: CARD_REF,
      assignee: { type: 'string', description: '"me", a member name or email. Empty to unassign.' }
    }, ['card']),
    annotations: { idempotentHint: true },
    run: async (ctx, args) => {
      const existing = await loadCard(ctx, need(args, 'card'))
      const wanted = str(args, 'assignee')
      let assigneeId: string | null = null
      if (wanted) {
        const members = await ctx.get<ApiMember[]>(`/api/projects/${existing.projectId}/members`)
        assigneeId = await resolveAssignee(ctx, members, wanted)
      }
      await ctx.send('PUT', `/api/cards/${existing.id}`, { assigneeId })
      const card = await loadCard(ctx, existing.id)
      return cardView(ctx, card, projectOf(card), card.statuses)
    }
  },
  {
    name: 'tag_card',
    description: 'Add or remove tags on a card by name. A tag that does not exist in the project yet is created on add. Removing a tag the card does not carry is not an error.',
    inputSchema: schema({
      card: CARD_REF,
      add: { type: 'array', items: { type: 'string' } },
      remove: { type: 'array', items: { type: 'string' } }
    }, ['card']),
    annotations: { idempotentHint: true },
    run: async (ctx, args) => {
      const existing = await loadCard(ctx, need(args, 'card'))
      const add = Array.isArray(args.add) ? args.add.map(String).filter(Boolean) : []
      const remove = Array.isArray(args.remove) ? args.remove.map(String).filter(Boolean) : []
      if (!add.length && !remove.length) throw new ToolError('Give tags to add, remove or both')
      const project = { ...projectOf(existing), tags: existing.projectTags }
      await applyTags(ctx, project, existing.id, (existing.tags ?? []).map(t => t.id), add, remove)
      const card = await loadCard(ctx, existing.id)
      return cardView(ctx, card, projectOf(card), card.statuses)
    }
  },
  {
    name: 'list_comments',
    description: 'The discussion on a card, oldest first. Reading it marks the card as read for the caller.',
    inputSchema: schema({ card: CARD_REF }, ['card']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const comments = await ctx.get<ApiComment[]>(`/api/cards/${cardNumber(need(args, 'card'))}/comments`)
      return comments.map(c => ({ author: c.authorName, body: c.body, createdAt: c.createdAt, edited: !!c.updatedAt }))
    }
  },
  {
    name: 'add_comment',
    description: 'Post a comment on a card as the caller. Markdown. @Name mentions notify that member.',
    inputSchema: schema({ card: CARD_REF, body: { type: 'string' } }, ['card', 'body']),
    run: async (ctx, args) => {
      const comment = await ctx.send<ApiComment>('POST', `/api/cards/${cardNumber(need(args, 'card'))}/comments`, { body: need(args, 'body') })
      return { author: comment.authorName, body: comment.body, createdAt: comment.createdAt }
    }
  },
  {
    name: 'my_tasks',
    description: 'Every open card assigned to the caller, grouped by project.',
    inputSchema: schema({}),
    annotations: { readOnlyHint: true },
    run: async (ctx) => {
      const { groups } = await ctx.get<ApiMyTasks>('/api/my-tasks')
      return groups.map(g => ({
        project: g.project.name,
        cards: g.cards.map(c => cardView(ctx, c, g.project, g.statuses))
      }))
    }
  },
  {
    name: 'create_project',
    description: 'Create a project with the default workflow (Backlog, To Do, In Progress, Review, Done), an Overview board and the tags Bug, Feature and Discuss. The caller becomes its owner.',
    inputSchema: schema({
      name: { type: 'string' },
      key: { type: 'string', description: '2 to 5 uppercase letters, the ticket prefix. Derived from the name when omitted.' },
      description: { type: 'string' }
    }, ['name']),
    run: async (ctx, args) => {
      const project = await ctx.send<ApiProjectRef>('POST', '/api/projects', {
        name: need(args, 'name'),
        key: str(args, 'key'),
        description: str(args, 'description')
      })
      return { name: project.name, key: project.key, slug: project.slug, url: `${ctx.origin}/projects/${project.slug}` }
    }
  }
]

/** Set a card's tags from names, creating the ones the project lacks. */
async function applyTags(
  ctx: ToolContext,
  project: { id: string, tags: ApiTag[] },
  cardId: number,
  currentIds: string[],
  add: string[],
  remove: string[]
) {
  const tags = [...project.tags]
  const ids = new Set(currentIds)
  for (const name of add) {
    let tag = tags.find(t => t.name === name) ?? tags.find(t => t.name.toLowerCase() === name.toLowerCase())
    if (!tag) {
      tag = await ctx.send<ApiTag>('POST', `/api/projects/${project.id}/tags`, { name })
      tags.push(tag)
    }
    ids.add(tag.id)
  }
  for (const name of remove) {
    const tag = tags.find(t => t.name === name) ?? tags.find(t => t.name.toLowerCase() === name.toLowerCase())
    if (tag) ids.delete(tag.id)
  }
  await ctx.send('PUT', `/api/cards/${cardId}/tags`, { tagIds: [...ids] })
}

export const toolDefinitions: ToolDefinition[] = TOOLS.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations }))

export function findTool(name: string): Tool | undefined {
  return TOOLS.find(t => t.name === name)
}

/** The message an API error carries, in the words the handler chose. */
function apiMessage(err: unknown): string {
  const e = err as { data?: { message?: string, statusMessage?: string }, statusCode?: number, message?: string }
  return e?.data?.message || e?.data?.statusMessage || e?.message || 'Request failed'
}

/**
 * The in-process API client for one MCP request. `event.$fetch` carries the
 * caller's Authorization (or session cookie) through to the handlers, so every
 * tool runs with exactly the permissions a direct API call would have.
 */
export function toolContext(event: H3Event, userId: string): ToolContext {
  // Untyped on purpose: Nuxt's typed routes try to match a dynamic path against
  // every route in the app and the compiler gives up ("Excessive stack depth").
  const fetch = event.$fetch as unknown as (path: string, init: Record<string, unknown>) => Promise<unknown>
  const call = async <T>(path: string, init: { method?: string, body?: unknown, query?: JsonObject }): Promise<T> => {
    try {
      return await fetch(path, {
        method: init.method ?? 'GET',
        body: init.body,
        query: init.query,
        headers: { accept: 'application/json' }
      }) as T
    } catch (err) {
      throw new ToolError(apiMessage(err))
    }
  }
  const { protocol, host } = getRequestURL(event, { xForwardedHost: true, xForwardedProto: true })
  return {
    get: (path, query) => call(path, { query }),
    send: (method, path, body) => call(path, { method, body }),
    origin: `${protocol}//${host}`,
    userId
  }
}
