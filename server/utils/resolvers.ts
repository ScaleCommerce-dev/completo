import { eq, or, and } from 'drizzle-orm'
import type { H3Event } from 'h3'

/** Fetch project by slug or ID + auth check. Returns membership for role access. */
export async function resolveProject(event: H3Event, opts?: { auth?: 'member' | 'owner' }) {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')!
  const project = db.select().from(schema.projects)
    .where(or(eq(schema.projects.slug, id), eq(schema.projects.id, id)))
    .get()
  if (!project) throw createError({ statusCode: 404, message: 'Project not found' })
  // Check membership first — 404 hides resource existence from non-members
  try {
    requireProjectMember(project.id, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Project not found' })
  }
  // If owner-level access required, check that separately — 403 is appropriate
  // since the user already proved membership
  const membership = opts?.auth === 'owner'
    ? requireProjectOwner(project.id, user.id, { isAdmin: user.isAdmin })
    : requireProjectMember(project.id, user.id, { isAdmin: user.isAdmin })
  return { user, project, membership }
}

/** Fetch board by ID + project member + optional column access check. */
export async function resolveBoard(event: H3Event, opts?: { columnAccess?: boolean }) {
  const { user } = await resolveAuth(event)
  const boardId = getRouterParam(event, 'id')!
  const board = db.select().from(schema.boards).where(eq(schema.boards.id, boardId)).get()
  if (!board) throw createError({ statusCode: 404, message: 'Board not found' })
  try {
    requireProjectMember(board.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Board not found' })
  }
  if (opts?.columnAccess !== false) {
    requireBoardColumnAccess(board, user.id, { isAdmin: user.isAdmin })
  }
  return { user, board }
}

/** Fetch card by numeric ID + project member check. */
export async function resolveCard(event: H3Event) {
  const { user } = await resolveAuth(event)
  const id = Number(getRouterParam(event, 'id'))
  const card = db.select().from(schema.cards).where(eq(schema.cards.id, id)).get()
  if (!card) throw createError({ statusCode: 404, message: 'Card not found' })
  try {
    requireProjectMember(card.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Card not found' })
  }
  return { user, card }
}

/** Fetch status by ID + project owner check. */
export async function resolveStatus(event: H3Event) {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')!
  const status = db.select().from(schema.statuses).where(eq(schema.statuses.id, id)).get()
  if (!status) throw createError({ statusCode: 404, message: 'Status not found' })
  // 404 for non-members, 403 for members who aren't owners
  try {
    requireProjectMember(status.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Status not found' })
  }
  requireProjectOwner(status.projectId, user.id, { isAdmin: user.isAdmin })
  return { user, status }
}

/** Fetch tag by ID + project owner check. */
export async function resolveTag(event: H3Event) {
  const { user } = await resolveAuth(event)
  const id = getRouterParam(event, 'id')!
  const tag = db.select().from(schema.tags).where(eq(schema.tags.id, id)).get()
  if (!tag) throw createError({ statusCode: 404, message: 'Tag not found' })
  // 404 for non-members, 403 for members who aren't owners
  try {
    requireProjectMember(tag.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Tag not found' })
  }
  requireProjectOwner(tag.projectId, user.id, { isAdmin: user.isAdmin })
  return { user, tag }
}

/** Fetch list by ID or slug + project member check. */
export async function resolveList(event: H3Event, opts?: { columnAccess?: boolean }) {
  const { user } = await resolveAuth(event)
  const listId = getRouterParam(event, 'id')!
  const { projectSlug } = getQuery(event) as { projectSlug?: string }

  let list
  if (projectSlug) {
    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.slug, projectSlug))
      .get()
    if (project) {
      list = db.select().from(schema.lists)
        .where(and(
          or(eq(schema.lists.id, listId), eq(schema.lists.slug, listId)),
          eq(schema.lists.projectId, project.id)
        ))
        .get()
    }
  }
  if (!list) {
    list = db.select().from(schema.lists)
      .where(or(eq(schema.lists.id, listId), eq(schema.lists.slug, listId)))
      .get()
  }
  if (!list) throw createError({ statusCode: 404, message: 'List not found' })

  let membership
  try {
    membership = requireProjectMember(list.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'List not found' })
  }

  if (opts?.columnAccess !== false) {
    requireListColumnAccess(list, user.id, { isAdmin: user.isAdmin })
  }
  return { user, list, membership }
}

/** Max listColumns position for a list. */
export function getMaxListColumnPosition(listId: string): number {
  return db.select({ pos: schema.listColumns.position }).from(schema.listColumns)
    .where(eq(schema.listColumns.listId, listId))
    .all()
    .reduce((max, r) => Math.max(max, r.pos), -1)
}

/** Admin-only guard. */
export async function requireAdmin(event: H3Event) {
  const { user } = await resolveAuth(event)
  if (!user.isAdmin) throw createError({ statusCode: 403, message: 'Admin access required' })
  return { user }
}

/** Max boardColumns position for a board. */
export function getMaxBoardColumnPosition(boardId: string): number {
  return db.select({ pos: schema.boardColumns.position }).from(schema.boardColumns)
    .where(eq(schema.boardColumns.boardId, boardId))
    .all()
    .reduce((max, r) => Math.max(max, r.pos), -1)
}

/** Max myTasksColumns position for a user. */
export function getMaxMyTasksColumnPosition(userId: string): number {
  return db.select({ pos: schema.myTasksColumns.position }).from(schema.myTasksColumns)
    .where(eq(schema.myTasksColumns.userId, userId))
    .all()
    .reduce((max, r) => Math.max(max, r.pos), -1)
}
