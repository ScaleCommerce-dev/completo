import { eq, and } from 'drizzle-orm'
import { boardCreateSchema } from '#shared/schemas/view'

export default defineEventHandler(async (event) => {
  const { user, project } = await resolveProject(event)
  const body = await readBodyAs(event, boardCreateSchema)

  // Generate or validate slug
  let slug = body.slug || generateSlug(body.name)

  if (!isValidSlug(slug)) {
    throw createError({ statusCode: 400, message: 'Invalid slug format' })
  }

  // Ensure slug is unique within the project
  const existing = db.select({ id: schema.boards.id })
    .from(schema.boards)
    .where(and(eq(schema.boards.projectId, project.id), eq(schema.boards.slug, slug)))
    .get()

  if (existing) {
    // Append short ID suffix for uniqueness
    const suffix = crypto.randomUUID().slice(0, 4)
    slug = `${slug}-${suffix}`
  }

  const existingBoards = db.select().from(schema.boards)
    .where(eq(schema.boards.projectId, project.id))
    .all()

  const boardId = crypto.randomUUID()
  db.insert(schema.boards).values({
    id: boardId,
    projectId: project.id,
    name: body.name,
    slug,
    // max + 1, not a count: after a delete, a count ties the new view with an existing one.
    position: existingBoards.reduce((max, v) => Math.max(max, v.position), -1) + 1,
    tagFilters: body.tagFilters?.length ? JSON.stringify(body.tagFilters) : null,
    hiddenCardFields: JSON.stringify(DEFAULT_HIDDEN_CARD_FIELDS),
    createdById: user.id
  }).run()

  // Never empty: project creation makes the default statuses, and the last one
  // cannot be deleted (statuses/[id].delete.ts).
  const projectStatuses = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, project.id))
    .all()

  // Determine which statuses to link
  const selectedStatusIds = body.columns?.length
    ? new Set(body.columns)
    : null

  // Link statuses to the new board
  let linkPosition = 0
  for (let i = 0; i < projectStatuses.length; i++) {
    // If columns were specified, only link selected ones
    if (selectedStatusIds && !selectedStatusIds.has(projectStatuses[i]!.id)) continue

    // Try to get position from an existing board's board_columns
    let position = linkPosition
    if (existingBoards.length > 0) {
      const existingBc = db.select().from(schema.boardColumns)
        .where(eq(schema.boardColumns.boardId, existingBoards[0]!.id))
        .all()
        .find(bc => bc.statusId === projectStatuses[i]!.id)
      if (existingBc) {
        position = existingBc.position
      }
    }

    db.insert(schema.boardColumns).values({
      boardId,
      statusId: projectStatuses[i]!.id,
      position
    }).run()
    linkPosition++
  }

  setResponseStatus(event, 201)
  // Same normalization the GET and PUT do: a board is one shape wherever it is
  // handed out, rather than an array from two endpoints and a JSON string here.
  const created = db.select().from(schema.boards).where(eq(schema.boards.id, boardId)).get()
  return created
    ? { ...created, hiddenCardFields: normalizeHiddenCardFields(safeParseJson(created.hiddenCardFields, [])) }
    : created
})
