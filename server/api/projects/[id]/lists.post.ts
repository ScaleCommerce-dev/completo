import { eq, and } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  const body = await readBody<{ name: string, slug?: string, columns?: string[], tagFilters?: string[] }>(event)

  if (!body.name) {
    throw createError({ statusCode: 400, message: 'List name is required' })
  }

  // Columns arrive from the create-view modal, but this endpoint took them on trust while
  // POST /lists/:id/columns validated the same input — so a bogus field could only be
  // inserted at creation time.
  const invalid = body.columns?.filter(f => !isListField(f)) ?? []
  if (invalid.length) {
    throw createError({ statusCode: 400, message: `Invalid field(s): ${invalid.join(', ')}. Must be one of: ${LIST_FIELD_KEYS.join(', ')}` })
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
  const columns = body.columns?.length ? body.columns : LIST_DEFAULT_FIELDS
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
