import { eq, and } from 'drizzle-orm'
import { listCreateSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  // Columns are checked against the field registry by the schema, as
  // `POST /lists/:id/columns` checks one: this endpoint once took them on trust.
  const body = await readBodyAs(event, listCreateSchema)

  // Generate or validate slug
  let slug = body.slug || generateSlug(body.name)

  if (!isValidSlug(slug)) {
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
  // The view and its columns together: a list saved without them is an empty
  // list the user did not ask for, with a name and slug now taken.
  db.transaction(() => {
    db.insert(schema.lists).values({
      id: listId,
      projectId: project.id,
      name: body.name,
      slug,
      // max + 1, not a count: after a delete, a count ties the new view with an existing one.
      position: existingLists.reduce((max, v) => Math.max(max, v.position), -1) + 1,
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
  })

  setResponseStatus(event, 201)
  return db.select().from(schema.lists).where(eq(schema.lists.id, listId)).get()
})
