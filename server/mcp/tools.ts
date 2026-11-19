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

/**
 * A result that is more than JSON: `get_attachment` hands an image back as an
 * image block the model can look at, and a text file as its text, rather than a
 * base64 string inside a JSON document. `structured` is what `structuredContent`
 * carries, so a client that reads that field still gets the metadata.
 */
export class ToolContent {
  readonly content: JsonObject[]
  readonly structured: JsonObject
  constructor(content: JsonObject[], structured: JsonObject) {
    this.content = content
    this.structured = structured
  }
}

export interface ToolContext {
  get<T>(path: string, query?: JsonObject): Promise<T>
  /** `body` may be a `FormData`, which goes out as multipart (attachments) instead of JSON. */
  send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T>
  /** A response body as bytes, for an attachment download. */
  getBytes(path: string): Promise<ArrayBuffer>
  /**
   * Where links point: `APP_URL` when set, as in emails and the OAuth metadata, so
   * a card link is the address people use rather than whatever host or forwarded
   * header this request arrived with.
   */
  origin: string
  userId: string
}

type Priority = 'low' | 'medium' | 'high' | 'urgent'

interface ApiStatus { id: string, name: string, color: string | null, cardCount?: number }
interface ApiTag { id: string, name: string, color: string }
interface ApiMember { id: string, name: string, email?: string | null, role?: string, kind?: 'human' | 'agent' }
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
  parentId?: number | null
  subtasks?: { total: number, done: number } | null
}
/** `GET /api/cards/:id` carries the project's pickers alongside the card. */
interface ApiCardDetail extends ApiCard {
  project: ApiProjectRef | null
  statuses: ApiStatus[]
  members: ApiMember[]
  projectTags: ApiTag[]
  subtaskCards: Array<{ id: number, ticket: string, title: string, statusId: string, assignee: { name: string } | null }>
}
interface ApiComment { id: string, body: string, authorName: string | null, createdAt: string, updatedAt: string | null }
interface ApiAttachment {
  id: string
  cardId: number
  originalName: string
  size: number
  createdAt: string
  uploader: { name: string } | null
}
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
  assignee: { name: string } | null
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
    // Keys are unique; names are not, so two projects called "Website" were
    // resolved to whichever the list returned first, and the write went there.
    const byName = all.filter(p => p.name.toLowerCase() === w)
    if (byName.length > 1 && !all.some(p => p.key.toLowerCase() === w)) {
      throw new ToolError(`"${ref}" names more than one project: ${byName.map(p => `${p.slug} (${p.key})`).join(', ')}. Use the slug or key.`)
    }
    const hit = all.find(p => p.key.toLowerCase() === w) ?? byName[0]
    if (!hit) {
      const names = all.map(p => `${p.slug} (${p.key})`).join(', ')
      throw new ToolError(`${(direct as Error).message}. Your projects: ${names || 'none'}`)
    }
    return ctx.get<ApiProject>(`/api/projects/${encodeURIComponent(hit.id)}`)
  }
}

/**
 * The card a ref names, checked against the project key it was given with.
 *
 * Card numbers are global, so `cardNumber` alone turned "AB-42" into card 42 of
 * whatever project it belongs to: a mistyped or invented key wrote to another
 * project's card, and the output named the real ticket only after the write.
 */
async function loadCard(ctx: ToolContext, ref: unknown): Promise<ApiCardDetail> {
  const card = await ctx.get<ApiCardDetail>(`/api/cards/${cardNumber(ref)}`)
  const s = String(ref ?? '').trim()
  const key = s.includes('-') ? s.slice(0, s.lastIndexOf('-')).toUpperCase() : null
  const actual = card.project?.key?.toUpperCase()
  if (key && actual && key !== actual) {
    throw new ToolError(`${s} does not exist: card ${card.id} is ${actual}-${card.id}. Check the ticket id.`)
  }
  return card
}

function cardUrl(ctx: ToolContext, slug: string, ticket: string) {
  return `${ctx.origin}/projects/${slug}/cards/${ticket}`
}

/**
 * How much of each description `list_cards` carries. Two hundred full descriptions
 * filled a model's context with text it rarely needs to pick a card; `get_card`
 * has the rest.
 */
const LIST_DESCRIPTION_CHARS = 500

function cardView(ctx: ToolContext, card: ApiCard, project: ApiProjectRef, statuses?: ApiStatus[], opts: { descriptionChars?: number } = {}) {
  const ticket = `${project.key}-${card.id}`
  const fullDescription = card.description ?? ''
  const cut = opts.descriptionChars !== undefined && fullDescription.length > opts.descriptionChars
  return {
    ticket,
    title: card.title,
    status: card.status?.name ?? statuses?.find(s => s.id === card.statusId)?.name ?? null,
    priority: card.priority ?? 'medium',
    assignee: card.assignee?.name ?? null,
    dueDate: card.dueDate ? card.dueDate.slice(0, 10) : null,
    tags: (card.tags ?? []).map(t => t.name),
    ...(card.commentCount !== undefined ? { comments: card.commentCount } : {}),
    ...(card.attachmentCount ? { attachments: card.attachmentCount } : {}),
    // A parent is always in the same project, so its ticket is the card's key.
    ...(card.parentId ? { parent: `${project.key}-${card.parentId}` } : {}),
    ...(card.subtasks ? { subtaskProgress: card.subtasks } : {}),
    description: cut ? `${fullDescription.slice(0, opts.descriptionChars)}…` : fullDescription,
    ...(cut ? { descriptionTruncated: true } : {}),
    project: project.slug,
    url: cardUrl(ctx, project.slug, ticket),
    createdAt: card.createdAt,
    updatedAt: card.updatedAt
  }
}

/**
 * How many comments get_card carries. A card's later comments often re-scope
 * it, so they belong with the card, but a long thread would bury it; the newest
 * are the ones most likely to supersede the description. Matches the CLI's
 * `get`.
 */
const CARD_COMMENT_LIMIT = 10

/**
 * `list_comments` was every comment a card ever had, in one tool result; a long
 * thread is mostly superseded, and the newest are the ones that matter.
 */
const LIST_COMMENTS_DEFAULT = 50
const LIST_COMMENTS_MAX = 200

function commentView(c: ApiComment) {
  // updatedAt is set on insert too, so its presence says nothing; an edit is a
  // later timestamp.
  return { author: c.authorName, body: c.body, createdAt: c.createdAt, edited: !!c.updatedAt && c.updatedAt !== c.createdAt }
}

// ─── Attachments ─────────────────────────────────────────────────────────────

/**
 * Text a get_attachment result carries by default. A 10 MB log in one tool result
 * buries everything else in the model's context; maxChars raises it when the
 * whole file is the point.
 */
const ATTACHMENT_TEXT_DEFAULT_CHARS = 100_000
const ATTACHMENT_TEXT_MAX_CHARS = 2_000_000

/**
 * Images get_attachment returns as an image block. Larger ones are refused by
 * model clients anyway (Claude's limit is 5 MB per image), so they come back as
 * metadata and a link instead of a payload the client throws away.
 */
const ATTACHMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024

/** Served types the model can read as text; everything else is binary to it. */
function isTextType(contentType: string): boolean {
  return contentType.startsWith('text/') || contentType === 'application/json' || contentType === 'application/xml'
}

/** Image types a model client renders. SVG is text that executes, not an image block. */
const MODEL_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

function attachmentView(ctx: ToolContext, a: ApiAttachment) {
  return {
    id: a.id,
    name: a.originalName,
    size: a.size,
    type: serveContentType(a.originalName),
    uploadedBy: a.uploader?.name ?? null,
    createdAt: a.createdAt,
    url: `${ctx.origin}/api/attachments/${a.id}/download`
  }
}

/**
 * The attachment a ref names among one card's attachments: the id, a unique id
 * prefix (the CLI prints eight characters), or the exact file name when only one
 * attachment has it. Resolving inside the card keeps a guessed id from reaching
 * another card's file; `/api/attachments/:id` takes a bare id with no card in it.
 */
function resolveAttachment(list: ApiAttachment[], ref: string, ticket: string): ApiAttachment {
  const w = ref.trim()
  const exact = list.find(a => a.id === w)
  if (exact) return exact
  const byPrefix = w.length >= 4 ? list.filter(a => a.id.startsWith(w)) : []
  if (byPrefix.length === 1) return byPrefix[0]!
  const byName = list.filter(a => a.originalName === w)
  if (byName.length === 1) return byName[0]!
  const names = list.map(a => `${a.id.slice(0, 8)} ${a.originalName}`).join(', ')
  if (byPrefix.length > 1 || byName.length > 1) {
    throw new ToolError(`"${ref}" matches more than one attachment on ${ticket}: ${names}. Use the id.`)
  }
  throw new ToolError(`No attachment "${ref}" on ${ticket}. Attachments: ${names || 'none'}`)
}

/** The file content add_attachment was given, as bytes: exactly one of text or base64. */
function attachmentBytes(args: JsonObject): Uint8Array {
  const text = args.text
  const b64 = args.base64
  if (text !== undefined && b64 !== undefined) throw new ToolError('Give text or base64, not both')
  if (typeof text === 'string') return new TextEncoder().encode(text)
  if (typeof b64 === 'string') {
    const clean = b64.replace(/\s+/g, '')
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) {
      throw new ToolError('"base64" is not valid base64')
    }
    return new Uint8Array(Buffer.from(clean, 'base64'))
  }
  throw new ToolError('Give the file content as "text" (UTF-8) or "base64"')
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
        members: members.map(m => ({ name: m.name, role: m.role, kind: m.kind })),
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
    description: 'Cards in a project, filtered by status, assignee, priority, tag, due date or parent. Sorted by board position by default, so the first card of a status is the top of its column. Sub-tasks are included and name their parent; parent lists one card\'s sub-tasks, or "none" leaves sub-tasks out. Done cards older than the project\'s retention window are left out unless includeDone is set. Descriptions are cut at 500 characters (descriptionTruncated); get_card has the whole card.',
    inputSchema: schema({
      project: PROJECT_REF,
      status: { type: 'string', description: 'Status name, e.g. "To Do".' },
      assignee: { type: 'string', description: '"me", a member name or email.' },
      priority: { type: 'string', description: 'One or more of low, medium, high, urgent, comma-separated.' },
      tag: { type: 'string', description: 'Tag name.' },
      dueBefore: { type: 'string', description: 'YYYY-MM-DD, inclusive.' },
      dueAfter: { type: 'string', description: 'YYYY-MM-DD, inclusive.' },
      parent: { type: 'string', description: 'A ticket id such as TK-42 for that card\'s sub-tasks, or "none" for cards that are not sub-tasks.' },
      includeDone: { type: 'boolean' },
      sort: { type: 'string', enum: ['position', 'priority', 'dueDate', 'createdAt', 'updatedAt', 'title'] },
      order: { type: 'string', enum: ['asc', 'desc'] },
      limit: { type: 'integer', minimum: 1, maximum: 200, description: 'Default 50.' },
      offset: { type: 'integer', minimum: 0, description: 'Skip this many, for the next page when a page came back full.' }
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
      const parent = str(args, 'parent')
      if (parent) query.parentId = parent.toLowerCase() === 'none' ? 'none' : cardNumber(parent)
      if (args.includeDone === true) query.includeDone = 'true'
      if (typeof args.limit === 'number') query.limit = args.limit
      if (typeof args.offset === 'number') query.offset = args.offset
      const cards = await ctx.get<ApiCard[]>(`/api/projects/${project.id}/cards`, query)
      return cards.map(c => cardView(ctx, c, project, undefined, { descriptionChars: LIST_DESCRIPTION_CHARS }))
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
      const hits = await ctx.get<ApiSearchHit[]>('/api/cards/search', only ? { q, projectId: only.id } : { q })
      return hits
        .map(h => ({
          ticket: `${h.projectKey}-${h.id}`,
          title: h.title,
          status: h.statusName,
          done: !!h.isDone,
          priority: h.priority ?? 'medium',
          assignee: h.assignee?.name ?? null,
          dueDate: h.dueDate ? h.dueDate.slice(0, 10) : null,
          project: h.projectSlug,
          url: cardUrl(ctx, h.projectSlug, `${h.projectKey}-${h.id}`)
        }))
    }
  },
  {
    name: 'get_card',
    description: `A card in full: description (Markdown; checklist items are \`- [ ]\` lines), status, assignee, tags, due date, link, its parent or sub-tasks, its attachments (names; get_attachment reads one), and its latest ${CARD_COMMENT_LIMIT} comments, oldest first. Comments are newer than the description and override it where they disagree. When commentCount is higher, list_comments has the rest. Does not mark the card as read.`,
    inputSchema: schema({ card: CARD_REF }, ['card']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      // Context for the model, not the person reading the card: markRead=false
      // keeps their unread dot, as `completo get` does.
      const comments = await ctx.get<ApiComment[]>(`/api/cards/${card.id}/comments?markRead=false`)
      const attachments = card.attachmentCount
        ? await ctx.get<ApiAttachment[]>(`/api/cards/${card.id}/attachments`)
        : []
      return {
        ...cardView(ctx, card, projectOf(card), card.statuses),
        ...(attachments.length ? { attachments: attachments.map(a => attachmentView(ctx, a)) } : {}),
        ...(card.subtaskCards.length
          ? {
              subtasks: card.subtaskCards.map(c => ({
                ticket: c.ticket,
                title: c.title,
                status: card.statuses.find(s => s.id === c.statusId)?.name ?? null,
                assignee: c.assignee?.name ?? null
              }))
            }
          : {}),
        commentCount: comments.length,
        comments: comments.slice(-CARD_COMMENT_LIMIT).map(commentView)
      }
    }
  },
  {
    name: 'create_card',
    description: 'Create a card. Lands at the bottom of its status. Status defaults to the project\'s first status that is not Done (usually Backlog); name the status when the user said where it goes. Tags that do not exist yet are created if the caller owns the project; otherwise name existing tags (see get_project). Give parent to create it as a sub-task of a card in the same project; sub-tasks have one level.',
    inputSchema: schema({
      project: PROJECT_REF,
      title: { type: 'string' },
      description: { type: 'string', description: 'Markdown. Use `- [ ]` lines for a checklist.' },
      status: { type: 'string', description: 'Status name.' },
      priority: PRIORITY,
      assignee: { type: 'string', description: '"me", a member name or email.' },
      dueDate: DUE_DATE,
      tags: { type: 'array', items: { type: 'string' }, description: 'Tag names.' },
      parent: { ...CARD_REF, description: 'Optional: the card this is a sub-task of, in the same project. Ticket id such as TK-42.' }
    }, ['project', 'title']),
    run: async (ctx, args) => {
      const project = await loadProject(ctx, need(args, 'project'))
      const statusRef = str(args, 'status')
      // Unnamed, the handler picks (`defaultStatusId`): `statuses` has no order to take a first from.
      const status = statusRef ? byName('status', project.statuses, statusRef) : undefined
      const body: JsonObject = {
        title: need(args, 'title'),
        statusId: status?.id,
        description: str(args, 'description'),
        priority: priorityArg(args),
        dueDate: str(args, 'dueDate')
      }
      const parent = str(args, 'parent')
      if (parent) body.parentId = cardNumber(parent)
      const assignee = str(args, 'assignee')
      if (assignee) {
        const members = await ctx.get<ApiMember[]>(`/api/projects/${project.id}/members`)
        body.assigneeId = await resolveAssignee(ctx, members, assignee)
      }
      // Tags before the card: a tag this caller may not create fails here, while
      // nothing exists yet. Resolved after it, the card was made and the call still
      // answered with an error, so a model retried and made a second card.
      const tagNames = Array.isArray(args.tags) ? args.tags.map(String) : []
      const tagIds = tagNames.length ? await resolveTagIds(ctx, project, tagNames) : []
      const created = await ctx.send<ApiCard>('POST', `/api/projects/${project.id}/cards`, body)
      if (tagIds.length) await ctx.send('PUT', `/api/cards/${created.id}/tags`, { tagIds })
      const card = await loadCard(ctx, created.id)
      return cardView(ctx, card, project, card.statuses)
    }
  },
  {
    name: 'update_card',
    description: 'Change a card\'s title, description, priority, due date or parent. Only the fields given change. The description is replaced whole: read it first and send the full new text.',
    inputSchema: schema({
      card: CARD_REF,
      title: { type: 'string' },
      description: { type: 'string', description: 'Markdown, replaces the whole description.' },
      priority: PRIORITY,
      dueDate: DUE_DATE,
      parent: { type: 'string', description: 'Make it a sub-task of this card (ticket id, same project). Pass an empty string to make it an ordinary card again.' }
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
      if (typeof args.parent === 'string') body.parentId = args.parent ? cardNumber(args.parent) : null
      if (!Object.keys(body).length) throw new ToolError('Nothing to change: give title, description, priority, dueDate or parent')
      await ctx.send('PUT', `/api/cards/${existing.id}`, body)
      const card = await loadCard(ctx, existing.id)
      return cardView(ctx, card, projectOf(card), card.statuses)
    }
  },
  {
    name: 'move_card',
    description: 'Move a card to another status (column), at the bottom unless a position is given. This is how a card walks through the workflow, e.g. "In Progress" then "Review". A card with open sub-tasks cannot move to the project\'s done status until they are done or detached; the error names them.',
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
    description: 'Add or remove tags on a card by name. A tag that does not exist in the project yet is created on add, if the caller owns the project. Removing a tag the card does not carry is not an error.',
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
    description: `The discussion on a card, oldest first: its latest ${LIST_COMMENTS_DEFAULT} comments, or up to ${LIST_COMMENTS_MAX} with limit. Reading it marks the card as read for the caller.`,
    inputSchema: schema({
      card: CARD_REF,
      limit: { type: 'integer', minimum: 1, maximum: LIST_COMMENTS_MAX, description: `How many of the newest comments. Default ${LIST_COMMENTS_DEFAULT}.` }
    }, ['card']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      const comments = await ctx.get<ApiComment[]>(`/api/cards/${card.id}/comments`)
      const limit = typeof args.limit === 'number' ? Math.min(Math.max(Math.floor(args.limit), 1), LIST_COMMENTS_MAX) : LIST_COMMENTS_DEFAULT
      return comments.slice(-limit).map(commentView)
    }
  },
  {
    name: 'add_comment',
    description: 'Post a comment on a card as the caller. Markdown. @Name mentions notify that member.',
    inputSchema: schema({ card: CARD_REF, body: { type: 'string' } }, ['card', 'body']),
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      const comment = await ctx.send<ApiComment>('POST', `/api/cards/${card.id}/comments`, { body: need(args, 'body') })
      return { author: comment.authorName, body: comment.body, createdAt: comment.createdAt }
    }
  },
  {
    name: 'list_attachments',
    description: 'The files attached to a card: id, name, size, type, who uploaded it and a download link. get_attachment reads one.',
    inputSchema: schema({ card: CARD_REF }, ['card']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      const list = await ctx.get<ApiAttachment[]>(`/api/cards/${card.id}/attachments`)
      return list.map(a => attachmentView(ctx, a))
    }
  },
  {
    name: 'add_attachment',
    description: `Attach a file to a card. Pass the content as "text" for a text file (CSV, Markdown, JSON, a log) or as "base64" for anything else; the name decides the type, so give it the right extension. Allowed: images, PDF, text, .md, .csv, .json, .xml, .zip and Office documents, up to the server's upload limit (${UPLOAD_MAX_SIZE_MB} MB by default).`,
    inputSchema: schema({
      card: CARD_REF,
      filename: { type: 'string', description: 'File name with extension, e.g. report.csv.' },
      text: { type: 'string', description: 'The file content as UTF-8 text. Use this or base64.' },
      base64: { type: 'string', description: 'The file content, base64-encoded. Use this or text.' }
    }, ['card', 'filename']),
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      const filename = need(args, 'filename').trim()
      if (/[\\/]/.test(filename)) throw new ToolError('"filename" is a name, not a path')
      const bytes = attachmentBytes(args)
      const form = new FormData()
      form.append('file', new Blob([bytes as BlobPart], { type: serveContentType(filename) }), filename)
      const created = await ctx.send<ApiAttachment>('POST', `/api/cards/${card.id}/attachments`, form)
      return { ticket: `${projectOf(card).key}-${card.id}`, ...attachmentView(ctx, created) }
    }
  },
  {
    name: 'get_attachment',
    description: `Read a file attached to a card. A text file (CSV, Markdown, JSON, XML, a log) comes back as its text, the first ${ATTACHMENT_TEXT_DEFAULT_CHARS.toLocaleString('en')} characters unless maxChars asks for more; a PNG, JPEG, GIF or WebP image comes back as an image. Any other file comes back as its details and download link only.`,
    inputSchema: schema({
      card: CARD_REF,
      attachment: { type: 'string', description: 'The attachment id (or its first 8 characters) or its exact file name, as list_attachments shows.' },
      maxChars: { type: 'integer', minimum: 1, maximum: ATTACHMENT_TEXT_MAX_CHARS, description: `For a text file: how many characters to return. Default ${ATTACHMENT_TEXT_DEFAULT_CHARS}.` }
    }, ['card', 'attachment']),
    annotations: { readOnlyHint: true },
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      const ticket = `${projectOf(card).key}-${card.id}`
      const list = await ctx.get<ApiAttachment[]>(`/api/cards/${card.id}/attachments`)
      const a = resolveAttachment(list, need(args, 'attachment'), ticket)
      const meta = { ticket, ...attachmentView(ctx, a) }
      const type = meta.type
      if (isTextType(type)) {
        const text = new TextDecoder().decode(await ctx.getBytes(`/api/attachments/${a.id}/download`))
        const limit = typeof args.maxChars === 'number'
          ? Math.min(Math.max(Math.floor(args.maxChars), 1), ATTACHMENT_TEXT_MAX_CHARS)
          : ATTACHMENT_TEXT_DEFAULT_CHARS
        const cut = text.length > limit
        const structured = { ...meta, chars: text.length, ...(cut ? { truncated: true, returnedChars: limit } : {}) }
        return new ToolContent([
          { type: 'text', text: JSON.stringify(structured, null, 2) },
          { type: 'text', text: cut ? text.slice(0, limit) : text }
        ], structured)
      }
      if (MODEL_IMAGE_TYPES.has(type) && a.size <= ATTACHMENT_IMAGE_MAX_BYTES) {
        const bytes = await ctx.getBytes(`/api/attachments/${a.id}/download`)
        return new ToolContent([
          { type: 'text', text: JSON.stringify(meta, null, 2) },
          { type: 'image', data: Buffer.from(bytes).toString('base64'), mimeType: type }
        ], meta)
      }
      const why = MODEL_IMAGE_TYPES.has(type)
        ? `The image is larger than ${ATTACHMENT_IMAGE_MAX_BYTES / 1024 / 1024} MB, so it is not returned.`
        : 'This file type is not returned as content.'
      return { ...meta, note: `${why} Download it from url, or with \`completo attachment ${ticket} download ${a.id.slice(0, 8)}\`.` }
    }
  },
  {
    name: 'delete_attachment',
    description: 'Remove a file from a card. Cannot be undone.',
    inputSchema: schema({
      card: CARD_REF,
      attachment: { type: 'string', description: 'The attachment id (or its first 8 characters) or its exact file name, as list_attachments shows.' }
    }, ['card', 'attachment']),
    annotations: { destructiveHint: true },
    run: async (ctx, args) => {
      const card = await loadCard(ctx, need(args, 'card'))
      const ticket = `${projectOf(card).key}-${card.id}`
      const list = await ctx.get<ApiAttachment[]>(`/api/cards/${card.id}/attachments`)
      const a = resolveAttachment(list, need(args, 'attachment'), ticket)
      await ctx.send('DELETE', `/api/attachments/${a.id}`)
      return { ticket, deleted: { id: a.id, name: a.originalName } }
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
/**
 * The ids for tag names in `project`, creating the ones that do not exist yet.
 * Names are trimmed first, as the tag schema stores them: an untrimmed " Bug "
 * matched nothing and created a second "Bug". Creating a tag is owner-only, so for
 * anyone else a missing name fails here; callers resolve before they write, so
 * that failure leaves nothing half-made behind.
 */
async function resolveTagIds(ctx: ToolContext, project: { id: string, tags: ApiTag[] }, names: string[]): Promise<string[]> {
  const tags = [...project.tags]
  const ids: string[] = []
  for (const raw of names) {
    const name = raw.trim()
    if (!name) continue
    let tag = tags.find(t => t.name === name) ?? tags.find(t => t.name.toLowerCase() === name.toLowerCase())
    if (!tag) {
      tag = await ctx.send<ApiTag>('POST', `/api/projects/${project.id}/tags`, { name })
      tags.push(tag)
    }
    ids.push(tag.id)
  }
  return ids
}

async function applyTags(
  ctx: ToolContext,
  project: { id: string, tags: ApiTag[] },
  cardId: number,
  currentIds: string[],
  add: string[],
  remove: string[]
) {
  const ids = new Set(currentIds)
  for (const id of await resolveTagIds(ctx, project, add)) ids.add(id)
  for (const raw of remove) {
    const name = raw.trim()
    const tag = project.tags.find(t => t.name === name) ?? project.tags.find(t => t.name.toLowerCase() === name.toLowerCase())
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
  const call = async <T>(path: string, init: { method?: string, body?: unknown, query?: JsonObject, bytes?: boolean }): Promise<T> => {
    const headers: Record<string, string> = { accept: init.bytes ? '*/*' : 'application/json' }
    let body = init.body
    if (body instanceof FormData) {
      // The in-process fetch drops a FormData body's multipart Content-Type, and the
      // upload handler then cannot parse it. Encoding it here keeps the boundary in
      // the header the handler reads.
      const encoded = new Response(body)
      headers['content-type'] = encoded.headers.get('content-type')!
      body = new Uint8Array(await encoded.arrayBuffer())
    }
    try {
      return await fetch(path, {
        method: init.method ?? 'GET',
        body,
        query: init.query,
        headers,
        ...(init.bytes ? { responseType: 'arrayBuffer' } : {})
      }) as T
    } catch (err) {
      throw new ToolError(apiMessage(err))
    }
  }
  return {
    get: (path, query) => call(path, { query }),
    send: (method, path, body) => call(path, { method, body }),
    getBytes: path => call<ArrayBuffer>(path, { bytes: true }),
    origin: publicOrigin(event),
    userId
  }
}
