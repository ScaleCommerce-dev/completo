import { eq, and } from 'drizzle-orm'

const DEFAULT_COLUMNS = ['ticketId', 'title', 'status', 'priority', 'assignee', 'dueDate', 'tags']

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  const body = await readBody<{ name: string; slug?: string; columns?: string[]; tagFilters?: string[] }>(event)

  if (!body.name) {
    throw createError({ statusCode: 400, message: 'List name is required' })
  }

  // Generate or validate slug
  let slug = body.slug || generateSlug(body.name)

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw createError({ statusCode: 400, message: 'Invalid slug format' })
  }

  // Ensure slug is unique within the project
  const existing = db.select({ id: schema.lists.id })
    .from(schema.lists)
    .where(and(eq(schema.lists.projectId, project.id), eq(schema.lists.slug, slug)))
    .get()

  if (existing) {
    const suffix = crypto.randomUUID().slice(0, 4)
    slug = `${slug}-${suffix}`
  }

  const existingLists = db.select().from(schema.lists)
    .where(eq(schema.lists.projectId, project.id))
    .all()

  const listId = crypto.randomUUID()
  db.insert(schema.lists).values({
    id: listId,
    projectId: project.id,
    name: body.name,
    slug,
    position: existingLists.length,
    tagFilters: body.tagFilters?.length ? JSON.stringify(body.tagFilters) : null,
    createdById: user.id
  }).run()

  // Create default field columns
  const columns = body.columns?.length ? body.columns : DEFAULT_COLUMNS
  for (let i = 0; i < columns.length; i++) {
    db.insert(schema.listColumns).values({
      listId,
      field: columns[i]!,
      position: i
    }).run()
  }

  setResponseStatus(event, 201)
  return db.select().from(schema.lists).where(eq(schema.lists.id, listId)).get()
})
