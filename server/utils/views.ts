import { eq, and, ne } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { storedFilter } from '#shared/schemas/view'

/**
 * What boards and lists share: a name, a slug unique in the project, the four
 * filters and the sub-task setting. The two update handlers and the two slug
 * checks each had their own copy of this, about seventy lines line for line; what
 * differs (a board's hidden card fields, a list's sort) stays in its handler.
 */
type ViewTable = typeof schema.boards | typeof schema.lists

interface SharedViewFields {
  name?: string
  slug?: string
  tagFilters?: string[] | null
  statusFilters?: string[] | null
  assigneeFilters?: string[] | null
  priorityFilters?: string[] | null
  showSubtasks?: boolean
}

function slugTaken(table: ViewTable, projectId: string, slug: string, excludeId?: string): boolean {
  const conditions = [eq(table.projectId, projectId), eq(table.slug, slug)]
  if (excludeId) conditions.push(ne(table.id, excludeId))
  return !!db.select({ id: table.id }).from(table).where(and(...conditions)).get()
}

/** The column updates for the shared fields a body names; a 409 for a slug another view of the project has. */
export function sharedViewUpdates(table: ViewTable, view: { id: string, projectId: string }, body: SharedViewFields) {
  const updates: Record<string, string | number | null> = {}
  if (body.name !== undefined) updates.name = body.name
  if (body.slug !== undefined) {
    if (slugTaken(table, view.projectId, body.slug, view.id)) {
      throw createError({ statusCode: 409, message: 'Slug already taken in this project' })
    }
    updates.slug = body.slug
  }
  for (const key of ['tagFilters', 'statusFilters', 'assigneeFilters', 'priorityFilters'] as const) {
    if (body[key] !== undefined) updates[key] = storedFilter(body[key])
  }
  if (body.showSubtasks !== undefined) updates.showSubtasks = body.showSubtasks ? 1 : 0
  return updates
}

/**
 * `GET /api/{boards,lists}/check-slug`: whether a slug is free in a project, for
 * the create and rename forms. Members only, and a 404 otherwise, so the check
 * cannot be used to read another project's view names.
 */
export async function viewSlugAvailability(event: H3Event, table: ViewTable) {
  const { user } = await resolveAuth(event)
  const query = getQuery(event)
  const slug = (query.slug as string || '').toLowerCase()
  const projectId = query.projectId as string
  const exclude = query.exclude as string | undefined
  if (!slug || !projectId) return { available: false }
  try {
    requireProjectMember(projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Not found' })
  }
  return { available: !slugTaken(table, projectId, slug, exclude) }
}
