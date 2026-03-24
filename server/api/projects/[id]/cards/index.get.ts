import { eq, and, lte, gte, inArray, sql, asc, desc } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { project } = await resolveProject(event)
  const query = getQuery(event)

  // Parse query params
  const statusId = query.statusId as string | undefined
  const assigneeId = query.assigneeId as string | undefined
  const priority = query.priority as string | undefined
  const tagId = query.tagId as string | undefined
  const dueBefore = query.dueBefore as string | undefined
  const dueAfter = query.dueAfter as string | undefined
  const limit = Math.min(Math.max(Number(query.limit) || 50, 1), 200)
  const offset = Math.max(Number(query.offset) || 0, 0)
  const sort = query.sort as string || 'position'
  const order = query.order as string || 'asc'
  const includeDone = query.includeDone === 'true'

  // Validate sort field
  const allowedSorts = ['position', 'priority', 'dueDate', 'createdAt', 'updatedAt', 'title']
  if (!allowedSorts.includes(sort)) {
    throw createError({ statusCode: 400, message: `Invalid sort field. Allowed: ${allowedSorts.join(', ')}` })
  }
  if (order !== 'asc' && order !== 'desc') {
    throw createError({ statusCode: 400, message: 'Invalid order. Allowed: asc, desc' })
  }

  // Build WHERE conditions
  const conditions: ReturnType<typeof eq>[] = [eq(schema.cards.projectId, project.id)]

  if (statusId) {
    conditions.push(eq(schema.cards.statusId, statusId))
  }
  if (assigneeId) {
    conditions.push(eq(schema.cards.assigneeId, assigneeId))
  }
  if (priority) {
    const valid = new Set(['low', 'medium', 'high', 'urgent'])
    const priorities = priority.split(',').map(p => p.trim()).filter(p => valid.has(p))
    if (priorities.length === 1) {
      conditions.push(sql`${schema.cards.priority} = ${priorities[0]}`)
    } else if (priorities.length > 1) {
      const placeholders = priorities.map(p => sql`${p}`)
      conditions.push(sql`${schema.cards.priority} IN (${sql.join(placeholders, sql`, `)})`)
    }
  }
  if (dueBefore) {
    conditions.push(lte(schema.cards.dueDate, new Date(dueBefore + 'T23:59:59.999Z')))
  }
  if (dueAfter) {
    conditions.push(gte(schema.cards.dueDate, new Date(dueAfter + 'T00:00:00.000Z')))
  }

  // Done retention filter (default: exclude expired done cards)
  if (!includeDone && project.doneStatusId && project.doneRetentionDays != null) {
    // updatedAt is stored as epoch seconds (integer with mode: 'timestamp')
    const cutoffSeconds = Math.floor((Date.now() - project.doneRetentionDays * 86400000) / 1000)
    conditions.push(
      sql`NOT (${schema.cards.statusId} = ${project.doneStatusId} AND ${schema.cards.updatedAt} < ${cutoffSeconds})`
    )
  }

  // Tag filter via subquery
  if (tagId) {
    const tagIds = tagId.split(',').map(t => t.trim()).filter(Boolean)
    if (tagIds.length > 0) {
      const placeholders = tagIds.map(id => sql`${id}`)
      conditions.push(
        sql`${schema.cards.id} IN (SELECT card_id FROM card_tags WHERE tag_id IN (${sql.join(placeholders, sql`, `)}))`
      )
    }
  }

  // Build ORDER BY
  const orderFn = order === 'desc' ? desc : asc
  let orderBy
  if (sort === 'priority') {
    const direction = order === 'desc' ? sql`DESC` : sql`ASC`
    orderBy = sql`CASE ${schema.cards.priority} WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ${direction}`
  } else {
    const col = {
      position: schema.cards.position,
      title: schema.cards.title,
      dueDate: schema.cards.dueDate,
      createdAt: schema.cards.createdAt,
      updatedAt: schema.cards.updatedAt
    }[sort]!
    orderBy = orderFn(col)
  }

  // Execute query
  const rows = db.select()
    .from(schema.cards)
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .leftJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(limit)
    .offset(offset)
    .all()

  const cards = rows.map(row => ({
    ...row.cards,
    assignee: row.users ? { id: row.users.id, name: row.users.name, avatarUrl: row.users.avatarUrl } : null,
    status: row.statuses ? { id: row.statuses.id, name: row.statuses.name, color: row.statuses.color } : null
  }))

  return enrichCardsWithMetadata(cards)
})
