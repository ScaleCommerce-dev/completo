import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const param = getRouterParam(event, 'id')!

  // Support ticket slug format (e.g. "TK-42") — extract number after last dash
  const dashIdx = param.lastIndexOf('-')
  const id = dashIdx > 0 ? Number(param.slice(dashIdx + 1)) : Number(param)

  if (isNaN(id)) {
    throw createError({ statusCode: 400, message: 'Invalid card ID' })
  }

  const row = db.select().from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(eq(schema.cards.id, id))
    .get()

  if (!row) {
    throw createError({ statusCode: 404, message: 'Card not found' })
  }

  try {
    requireProjectMember(row.cards.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Card not found' })
  }

  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, row.cards.projectId))
    .get()

  const statuses = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, row.cards.projectId))
    .all()

  const members = db.select({
    id: schema.users.id,
    name: schema.users.name,
    avatarUrl: schema.users.avatarUrl
  })
    .from(schema.projectMembers)
    .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
    .where(eq(schema.projectMembers.projectId, row.cards.projectId))
    .all()

  // Fetch tags on this card
  const cardTagRows = db.select().from(schema.cardTags)
    .innerJoin(schema.tags, eq(schema.cardTags.tagId, schema.tags.id))
    .where(eq(schema.cardTags.cardId, id))
    .all()

  const tags = cardTagRows.map(r => ({
    id: r.tags.id,
    name: r.tags.name,
    color: r.tags.color
  }))

  // Fetch all project tags for the picker
  const projectTags = db.select().from(schema.tags)
    .where(eq(schema.tags.projectId, row.cards.projectId))
    .all()

  return {
    ...row.cards,
    assignee: row.users ? { id: row.users.id, name: row.users.name, avatarUrl: row.users.avatarUrl } : null,
    project: project ? { id: project.id, name: project.name, slug: project.slug, key: project.key } : null,
    statuses,
    members,
    tags,
    projectTags
  }
})
