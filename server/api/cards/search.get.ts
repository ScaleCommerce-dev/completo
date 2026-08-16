import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

/**
 * Cross-project card search, for the command palette.
 *
 * `/api/projects/:id/cards/search` already exists and stays: the CLI and the
 * description editor's `#` picker both know which project they are in and want
 * ten titles from it. This one answers the different question — "where is that
 * card" from anywhere in the app — so it has to resolve visibility itself
 * rather than take a project in the URL: every project the caller is a member
 * of, plus every project at all for an instance admin, which is the same rule
 * `/api/projects` applies to the sidebar. (My Tasks is deliberately *not*
 * admin-elevated; it answers "assigned to me", and admin does not widen that.)
 *
 * Non-members leak nothing: a project the caller cannot see is never in the
 * `IN (…)` scope, so its cards are absent rather than forbidden.
 */

/** Enough to be worth scrolling, few enough to leave the other groups visible. */
const LIMIT = 10

export default defineEventHandler(async (event) => {
  const { user } = await resolveAuth(event)
  const q = ((getQuery(event).q as string) || '').trim()

  if (!isCardSearchable(q)) return []

  const projectIds = user.isAdmin
    ? db.select({ id: schema.projects.id }).from(schema.projects).all().map(p => p.id)
    : db.select({ id: schema.projectMembers.projectId })
        .from(schema.projectMembers)
        .where(eq(schema.projectMembers.userId, user.id))
        .all().map(m => m.id)

  if (!projectIds.length) return []

  // `%` and `_` are wildcards and `\` is the escape declared below, so all three
  // have to survive as literals — searching for "50%" must not match everything.
  // SQLite's LIKE has no escape character *unless* ESCAPE is given, which is why
  // the clause is raw rather than drizzle's `like()`. LIKE is already
  // case-insensitive for ASCII, so nothing lowercases either side.
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const titleMatch = sql`${schema.cards.title} LIKE ${pattern} ESCAPE '\\'`
  const bodyMatch = sql`${schema.cards.description} LIKE ${pattern} ESCAPE '\\'`

  const exactId = cardSearchId(q)

  // A one-character query is here only because it named a card id, and the
  // substring match it would otherwise run is the thing the length floor exists
  // to prevent — so it is left out rather than run on a shorter string.
  const conditions: SQL[] = []
  if (q.length >= CARD_SEARCH_MIN_LENGTH) conditions.push(titleMatch, bodyMatch)
  if (exactId !== null) conditions.push(eq(schema.cards.id, exactId))

  const rows = db.select({
    id: schema.cards.id,
    title: schema.cards.title,
    description: schema.cards.description,
    priority: schema.cards.priority,
    dueDate: schema.cards.dueDate,
    updatedAt: schema.cards.updatedAt,
    projectId: schema.projects.id,
    projectName: schema.projects.name,
    projectSlug: schema.projects.slug,
    projectKey: schema.projects.key,
    statusName: schema.statuses.name,
    statusColor: schema.statuses.color,
    // Whether this is the project's *done* status, so the preview can mark it
    // the way every other surface does — a check rather than one more dot.
    isDone: sql<number>`${schema.cards.statusId} = ${schema.projects.doneStatusId}`,
    assigneeId: schema.users.id,
    assigneeName: schema.users.name,
    assigneeAvatarUrl: schema.users.avatarUrl
  })
    .from(schema.cards)
    .innerJoin(schema.projects, eq(schema.cards.projectId, schema.projects.id))
    .leftJoin(schema.statuses, eq(schema.cards.statusId, schema.statuses.id))
    .leftJoin(schema.users, eq(schema.cards.assigneeId, schema.users.id))
    .where(and(
      inArray(schema.cards.projectId, projectIds),
      or(...conditions)
    ))
    // Rank before recency, or the one card whose id you typed falls off the end
    // of a ten-row limit behind ten cards that merely mention the number.
    .orderBy(
      asc(sql`case when ${schema.cards.id} = ${exactId ?? -1} then 0 when ${titleMatch} then 1 else 2 end`),
      desc(schema.cards.updatedAt)
    )
    .limit(LIMIT)
    .all()

  // Everything the palette's preview pane shows travels with the search result.
  // The alternative — fetching the highlighted card on each keystroke of ↑/↓ —
  // puts a request and a spinner between the reader and the answer at exactly
  // the moment they are scanning, and arrowing through ten rows would fire ten
  // of them. Ten cards is a bounded amount of extra data to carry instead.
  const { tagsByCard } = fetchCardMetadata(rows.map(r => r.id))

  return rows.map(({ description, isDone, assigneeId, assigneeName, assigneeAvatarUrl, ...card }) => ({
    ...card,
    isDone: !!isDone,
    // The part of the description this query matched, not its opening lines.
    snippet: descriptionSnippet(description, q),
    assignee: assigneeId ? { id: assigneeId, name: assigneeName!, avatarUrl: assigneeAvatarUrl } : null,
    tags: tagsByCard.get(card.id) || []
  }))
})
