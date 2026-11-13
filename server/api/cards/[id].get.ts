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

  let membership
  try {
    membership = requireProjectMember(row.cards.projectId, user.id, { isAdmin: user.isAdmin })
  } catch {
    throw createError({ statusCode: 404, message: 'Card not found' })
  }

  const project = db.select().from(schema.projects)
    .where(eq(schema.projects.id, row.cards.projectId))
    .get()

  const statuses = db.select().from(schema.statuses)
    .where(eq(schema.statuses.projectId, row.cards.projectId))
    .all()

  const members = db.select(memberRefColumns())
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

  const { ref, member } = createUserRefs([row.users, ...members])

  // Parent, sub-issues, relations and milestone. A card in a project the viewer
  // cannot read is reduced to its id (`cardRefs`).
  const visible = visibleProjectIds(user)
  const childIds = db.select({ id: schema.cards.id }).from(schema.cards)
    .where(eq(schema.cards.parentId, id)).orderBy(schema.cards.id).all().map(c => c.id)
  const refs = cardRefs([...childIds, ...(row.cards.parentId ? [row.cards.parentId] : [])], visible)
  const parentRef = row.cards.parentId ? refs.get(row.cards.parentId) ?? null : null
  const milestone = row.cards.milestoneId
    ? db.select({ id: schema.milestones.id, name: schema.milestones.name, targetDate: schema.milestones.targetDate })
      .from(schema.milestones).where(eq(schema.milestones.id, row.cards.milestoneId)).get() ?? null
    : null

  return {
    ...row.cards,
    // The viewer's role in this project, as boards and lists already return, so the
    // client can show owner-only affordances (e.g. moderating others' comments).
    // Admins get a synthetic 'owner' — don't render it as a real project role.
    role: membership.role,
    assignee: ref(row.users),
    creator: row.cards.createdById ? fetchCardCreators([row.cards]).get(row.cards.createdById) || null : null,
    project: project ? { id: project.id, name: project.name, slug: project.slug, key: project.key } : null,
    statuses,
    members: members.map(member),
    tags,
    projectTags,
    parent: parentRef && !parentRef.hidden
      ? { ...parentRef, childProgress: childProgress([parentRef.id]).get(parentRef.id) ?? { total: 0, completed: 0 } }
      : parentRef,
    children: childIds.map(c => refs.get(c)).filter(Boolean),
    childProgress: childProgress([id]).get(id) ?? { total: 0, completed: 0 },
    relations: cardRelations(id, visible),
    milestone
  }
})
